function json(data,init={}){return new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}});}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){const raw=request.headers.get('cookie')||'';return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));}
function normalized(value){return String(value||'').trim().toLowerCase();}
function uuid(prefix){return `${prefix}-${crypto.randomUUID()}`;}
function secondsSince(value){const ms=new Date(value).getTime();return Number.isFinite(ms)?Math.max(0,Math.floor((Date.now()-ms)/1000)):0;}

async function currentStaff(request,env){
  const token=parseCookies(request).aria_session;if(!token||!env.DB)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`SELECT u.id AS user_id,u.email,u.display_name,u.account_type,u.status,(SELECT role_name FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS role_name,(SELECT department FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS department FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1`).bind(tokenHash,new Date().toISOString()).first();
}
function canStart(session){
  const role=normalized(session?.role_name);
  if(role==='live support specialist')return normalized(session?.department)==='operations';
  return ['founder','founder / co-founder','co-founder','supervisor of live support'].includes(role);
}
async function startTicket(env,session,id){
  const ticket=await env.DB.prepare(`SELECT * FROM tickets WHERE id=? AND department='Operations' AND category='Member Communication' LIMIT 1`).bind(id).first();
  if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  if(ticket.status==='Closed')return json({ok:false,error:'Closed Live Support conversations cannot be started.'},{status:409});
  if(ticket.assigned_to_user_id===session.user_id)return json({ok:true,started:true,ticketId:id,alreadyAssigned:true});
  if(ticket.assigned_to_user_id)return json({ok:false,error:'This Live Support conversation is already assigned to another staff member.'},{status:409});
  const now=new Date().toISOString();
  const responseSeconds=secondsSince(ticket.created_at);
  const result=await env.DB.prepare(`UPDATE tickets SET assigned_to_user_id=?,status='In Progress',progress=25,updated_at=? WHERE id=? AND assigned_to_user_id IS NULL AND status!='Closed'`).bind(session.user_id,now,id).run();
  if(Number(result?.meta?.changes||0)!==1)return json({ok:false,error:'This Live Support conversation was started by another staff member.'},{status:409});
  try{
    await env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at) VALUES (?, 'Member Communication','live_support_conversation_started',?,'ticket',?,?,?, ?,?)`).bind(uuid('AUD'),session.user_id,id,id,JSON.stringify({role:session.role_name,responseSeconds,responseTargetSeconds:120,responseWithinTarget:responseSeconds<=120}),now,now).run();
  }catch(error){console.error('Live support start audit failed',error);}
  try{
    const incident=await env.DB.prepare(`SELECT id,member_user_id,current_risk_level FROM lifeline_incidents WHERE related_ticket_id=? AND status!='closed' ORDER BY updated_at DESC LIMIT 1`).bind(id).first();
    if(incident){
      await env.DB.batch([
        env.DB.prepare(`UPDATE lifeline_incidents SET status='in_progress',assigned_staff_user_id=?,claimed_at=COALESCE(claimed_at,?),updated_at=? WHERE id=?`).bind(session.user_id,now,now,incident.id),
        env.DB.prepare(`INSERT INTO lifeline_events (id,incident_id,member_user_id,event_type,risk_level,actor_type,actor_user_id,details_json,occurred_at,recorded_at) VALUES (?,?,?,?,?,'staff',?,?,?,?)`).bind(uuid('LFLE'),incident.id,incident.member_user_id,'human_support_assigned',incident.current_risk_level||null,session.user_id,JSON.stringify({ticketId:id,responseSeconds,responseTargetSeconds:120,responseWithinTarget:responseSeconds<=120}),now,now)
      ]);
    }
  }catch(error){console.error('Live support start incident sync failed',error);}
  return json({ok:true,started:true,ticketId:id,responseSeconds,responseTargetSeconds:120,responseWithinTarget:responseSeconds<=120,updatedAt:now});
}

export async function handleLiveSupportStartRoute(request,env){
  const url=new URL(request.url);
  const match=url.pathname.match(/^\/api\/staff\/live-support\/tickets\/([^/]+)\/start$/);
  if(!match)return null;
  if(request.method!=='POST')return json({ok:false,error:'Method not allowed.'},{status:405});
  const session=await currentStaff(request,env);
  if(!session||session.account_type!=='staff'||session.status!=='active')return json({ok:false,error:'Staff authentication required.'},{status:401});
  if(!canStart(session))return json({ok:false,error:'You are not authorized to start a Live Support conversation.'},{status:403});
  return startTicket(env,session,decodeURIComponent(match[1]));
}
