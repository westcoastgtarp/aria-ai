function json(data,init={}){
  return new Response(JSON.stringify(data),{
    ...init,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}
  });
}

function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){
  const raw=request.headers.get('cookie')||'';
  return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
}
async function currentMember(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;
  if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.email,u.display_name
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
      AND u.account_type='member' AND u.status='active'
    LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}
function ticketId(){return `OPS-LFL-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0,4).toUpperCase()}`;}
async function audit(env,member,id,risk,trigger){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at)
    VALUES (?, 'Lifeline Safety','lifeline_human_support_escalated',?,'member',?,?,?, ?, ?)
  `).bind(`AUD-${crypto.randomUUID()}`,member.user_id,member.user_id,id,JSON.stringify({risk,trigger,channel:'chat_only'}),now,now).run();
}
async function escalate(request,env){
  const member=await currentMember(request,env);
  if(!member)return json({ok:false,error:'Member authentication required.'},{status:401});
  let body={};try{body=await request.json();}catch{}
  const risk=String(body?.risk||'').toLowerCase();
  const trigger=String(body?.trigger||'automatic_distress_monitor').slice(0,80);
  if(!['concern','high','critical'].includes(risk))return json({ok:false,error:'A qualifying Lifeline risk level is required.'},{status:400});

  const cutoff=new Date(Date.now()-30*60*1000).toISOString();
  const existing=await env.DB.prepare(`
    SELECT id,status,updated_at FROM tickets
    WHERE created_by_user_id=? AND department='Operations' AND category='Customer Service'
      AND title='Lifeline live support escalation' AND status!='Closed' AND updated_at>=?
    ORDER BY updated_at DESC LIMIT 1
  `).bind(member.user_id,cutoff).first();
  if(existing)return json({ok:true,queued:true,ticketId:existing.id,deduplicated:true});

  const id=ticketId();
  const now=new Date().toISOString();
  const details=`Automatic Lifeline chat escalation. Risk level: ${risk}. Trigger: ${trigger}. Chat-only trained-agent review requested. Do not contact third parties on the member's behalf.`;
  await env.DB.prepare(`
    INSERT INTO tickets
    (id,department,category,title,description,priority,status,progress,created_by_user_id,assigned_to_user_id,created_at,updated_at)
    VALUES (?,'Operations','Customer Service','Lifeline live support escalation',?,'Urgent','Open',0,?,NULL,?,?)
  `).bind(id,details,member.user_id,now,now).run();
  try{await audit(env,member,id,risk,trigger);}catch(error){console.error('Lifeline support audit failed',error);}
  return json({ok:true,queued:true,ticketId:id,deduplicated:false},{status:201});
}
export async function handleLifelineSupportRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/member/lifeline/support-escalate'&&request.method==='POST')return escalate(request,env);
  return null;
}
