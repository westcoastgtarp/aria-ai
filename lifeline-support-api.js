import { queueLifelineHumanSupport } from './lifeline-persistence.js';

function json(data,init={}){return new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}});}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){const raw=request.headers.get('cookie')||'';return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));}
async function currentMember(request,env){if(!env.DB)return null;const token=parseCookies(request).aria_session;if(!token)return null;const tokenHash=await sha256(token);return env.DB.prepare(`SELECT u.id AS user_id,u.email,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.account_type='member' AND u.status='active' LIMIT 1`).bind(tokenHash,new Date().toISOString()).first();}
function ticketId(){return `OPS-LFL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;}
function firstName(value){return String(value||'').trim().split(/\s+/)[0].slice(0,40);}
async function audit(env,member,id,risk,trigger,incidentId,{deduplicated=false}={}){
  const now=new Date().toISOString();
  const auditId=`AUD-${crypto.randomUUID()}`;
  const result=await env.DB.prepare(`
    INSERT INTO audit_events
    (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at)
    VALUES (?, 'Member Communication','live_support_requested',?,'member',?,?,?,?,?)
  `).bind(
    auditId,
    member.user_id,
    member.user_id,
    id,
    JSON.stringify({risk,trigger,channel:'chat_only',queueCategory:'Member Communication',incidentId:incidentId||null,deduplicated}),
    now,
    now
  ).run();
  if(Number(result?.meta?.changes||0)!==1)throw new Error('Live Support request audit event was not persisted.');
  return auditId;
}

async function persistQueueLink(env,member,risk,ticketIdValue,trigger){
  try{return await queueLifelineHumanSupport(env,{memberUserId:member.user_id,riskLevel:risk,ticketId:ticketIdValue,trigger});}
  catch(error){console.error('Lifeline incident queue persistence failed',error);return {persisted:false,incidentId:null,reason:'write_failed'};}
}

async function supportStatus(request,env){
  const member=await currentMember(request,env);
  if(!member)return json({ok:false,error:'Member authentication required.'},{status:401});

  const row=await env.DB.prepare(`
    SELECT t.id,t.status,t.assigned_to_user_id,u.display_name AS assigned_name
    FROM tickets t
    LEFT JOIN users u ON u.id=t.assigned_to_user_id
    WHERE t.created_by_user_id=?
      AND t.department='Operations'
      AND t.category='Member Communication'
      AND t.title='Lifeline member communication escalation'
      AND t.status!='Closed'
    ORDER BY t.updated_at DESC
    LIMIT 1
  `).bind(member.user_id).first();

  if(!row)return json({ok:true,liveSupport:false,assigned:false,displayName:null});
  const displayName=firstName(row.assigned_name);
  return json({
    ok:true,
    liveSupport:true,
    assigned:Boolean(row.assigned_to_user_id&&displayName),
    displayName:displayName||null
  });
}

async function escalate(request,env){
  const member=await currentMember(request,env);if(!member)return json({ok:false,error:'Member authentication required.'},{status:401});
  let body={};try{body=await request.json();}catch{}
  const risk=String(body?.risk||'').toLowerCase();const trigger=String(body?.trigger||'member_requested_live_support').slice(0,80);
  if(!['concern','high','critical'].includes(risk))return json({ok:false,error:'A qualifying Lifeline risk level is required.'},{status:400});

  const cutoff=new Date(Date.now()-30*60*1000).toISOString();
  const existing=await env.DB.prepare(`SELECT id,status,updated_at FROM tickets WHERE created_by_user_id=? AND department='Operations' AND category='Member Communication' AND title='Lifeline member communication escalation' AND status!='Closed' AND updated_at>=? ORDER BY updated_at DESC LIMIT 1`).bind(member.user_id,cutoff).first();
  if(existing){
    const persistence=await persistQueueLink(env,member,risk,existing.id,trigger);
    try{
      const auditId=await audit(env,member,existing.id,risk,trigger,persistence.incidentId,{deduplicated:true});
      return json({ok:true,queued:true,ticketId:existing.id,deduplicated:true,category:'Member Communication',incidentId:persistence.incidentId||null,persisted:Boolean(persistence.persisted),auditId});
    }catch(error){
      console.error('Required Live Support request audit failed',error);
      return json({ok:false,error:'The live support request could not be fully recorded. Please try again.'},{status:500});
    }
  }

  const id=ticketId();const now=new Date().toISOString();
  const details=`Member requested live support from the Aria conversation. Risk level: ${risk}. Trigger: ${trigger}. Chat-only trained-agent review requested. Do not contact third parties on the member's behalf.`;
  await env.DB.prepare(`INSERT INTO tickets (id,department,category,title,description,priority,status,progress,created_by_user_id,assigned_to_user_id,created_at,updated_at) VALUES (?,'Operations','Member Communication','Lifeline member communication escalation',?,'Urgent','Open',0,?,NULL,?,?)`).bind(id,details,member.user_id,now,now).run();

  const persistence=await persistQueueLink(env,member,risk,id,trigger);
  try{
    const auditId=await audit(env,member,id,risk,trigger,persistence.incidentId,{deduplicated:false});
    return json({ok:true,queued:true,ticketId:id,deduplicated:false,category:'Member Communication',incidentId:persistence.incidentId||null,persisted:Boolean(persistence.persisted),auditId},{status:201});
  }catch(error){
    console.error('Required Live Support request audit failed',error);
    await env.DB.prepare(`DELETE FROM tickets WHERE id=? AND status='Open' AND assigned_to_user_id IS NULL`).bind(id).run().catch(()=>{});
    return json({ok:false,error:'The live support request could not be fully recorded. Please try again.'},{status:500});
  }
}

export async function handleLifelineSupportRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/member/lifeline/support-status'&&request.method==='GET')return supportStatus(request,env);
  if(url.pathname==='/api/member/lifeline/support-escalate'&&request.method==='POST')return escalate(request,env);
  return null;
}
