function json(data,init={}){
  return new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}});
}
function normalized(value){return String(value||'').trim().toLowerCase();}
function firstName(value){return String(value||'').trim().split(/\s+/)[0].slice(0,40);}
function uuid(prefix){return `${prefix}-${crypto.randomUUID()}`;}
function parseCookies(request){const raw=request.headers.get('cookie')||'';return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));}
async function sha256(value){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value)));return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function readBody(request){try{return await request.json();}catch{return null;}}

async function currentStaff(request,env){
  const token=parseCookies(request).aria_session;if(!token||!env.DB)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.email,u.display_name,u.account_type,u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS role_name,
      (SELECT department FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS department
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}

async function ticket(env,id){
  return env.DB.prepare(`SELECT id,status,category,department,assigned_to_user_id,created_by_user_id FROM tickets WHERE id=? AND department='Operations' AND category='Member Communication' LIMIT 1`).bind(id).first();
}
function canEscalate(session,t){
  if(!session||session.account_type!=='staff'||session.status!=='active'||!t||t.status==='Closed')return false;
  const role=normalized(session.role_name);
  if(['founder','founder / co-founder','co-founder','supervisor of live support','lead supervisor','supervisor'].includes(role))return true;
  return normalized(session.department)==='operations'&&t.assigned_to_user_id===session.user_id;
}
function roleMatchesTarget(roleName,targetRole){
  const role=normalized(roleName);
  const target=normalized(targetRole);
  if(target==='founder')return ['founder','founder / co-founder','co-founder'].includes(role);
  if(target==='lead supervisor')return role==='lead supervisor';
  if(target==='supervisor')return ['supervisor','supervisor of live support'].includes(role);
  return false;
}
async function audit(env,session,ticketId,eventType,details){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at) VALUES (?, 'Member Communication', ?, ?, 'ticket', ?, ?, ?, ?, ?)`)
    .bind(uuid('AUD'),eventType,session.user_id,ticketId,ticketId,JSON.stringify(details),now,now).run();
}

async function getEscalation(env,id){
  const row=await env.DB.prepare(`
    SELECT e.id,e.target_role,e.target_user_id,e.picked_up_by_user_id,e.picked_up_at,e.reason,e.status,e.created_at,
      by_user.display_name AS escalated_by_name,by_user.email AS escalated_by_email,
      target.display_name AS target_name,target.email AS target_email,
      pickup.display_name AS picked_up_by_name,pickup.email AS picked_up_by_email
    FROM live_support_escalations e
    LEFT JOIN users by_user ON by_user.id=e.escalated_by_user_id
    LEFT JOIN users target ON target.id=e.target_user_id
    LEFT JOIN users pickup ON pickup.id=e.picked_up_by_user_id
    WHERE e.ticket_id=? AND e.status='active'
    ORDER BY e.created_at DESC LIMIT 1
  `).bind(id).first();
  return row?{
    id:row.id,
    targetRole:row.target_role,
    targetUserId:row.target_user_id||null,
    targetName:row.target_user_id?firstName(row.target_name||row.target_email):null,
    awaitingPickup:!row.picked_up_at,
    pickedUpByUserId:row.picked_up_by_user_id||null,
    pickedUpByName:row.picked_up_by_user_id?firstName(row.picked_up_by_name||row.picked_up_by_email):null,
    pickedUpAt:row.picked_up_at||null,
    reason:row.reason,
    status:row.status,
    createdAt:row.created_at,
    escalatedBy:row.escalated_by_name||row.escalated_by_email||'Staff'
  }:null;
}

async function createEscalation(request,env,session,id,t){
  if(!canEscalate(session,t))return json({ok:false,error:'You are not authorized to escalate this conversation.'},{status:403});
  const body=await readBody(request);
  const targetRole=String(body?.targetRole||'').trim();
  const reason=String(body?.reason||'').trim();
  if(!['Lead Supervisor','Supervisor','Founder'].includes(targetRole))return json({ok:false,error:'Choose Lead Supervisor, Supervisor, or Founder.'},{status:400});
  if(!reason)return json({ok:false,error:'Enter a short reason for the escalation.'},{status:400});
  if(reason.length>500)return json({ok:false,error:'Escalation reason must be 500 characters or fewer.'},{status:400});

  const now=new Date().toISOString();
  const escalationId=uuid('ESC');
  await env.DB.batch([
    env.DB.prepare(`UPDATE live_support_escalations SET status='resolved',resolved_at=?,resolved_by_user_id=? WHERE ticket_id=? AND status='active'`).bind(now,session.user_id,id),
    env.DB.prepare(`INSERT INTO live_support_escalations (id,ticket_id,escalated_by_user_id,target_user_id,target_role,reason,status,created_at) VALUES (?,?,?,NULL,?,?,'active',?)`).bind(escalationId,id,session.user_id,targetRole,reason,now)
  ]);
  try{await audit(env,session,id,'live_support_escalated',{escalationId,targetRole,awaitingPickup:true,reason});}catch(error){console.error('Live support escalation audit failed',error);}
  return json({ok:true,escalation:{id:escalationId,targetRole,targetUserId:null,targetName:null,awaitingPickup:true,pickedUpByUserId:null,pickedUpByName:null,pickedUpAt:null,reason,status:'active',createdAt:now,escalatedBy:session.display_name||session.email||'Staff'}},{status:201});
}

async function pickupEscalation(env,session,id,t){
  if(t.status==='Closed')return json({ok:false,error:'This conversation is already closed.'},{status:409});
  const escalation=await getEscalation(env,id);
  if(!escalation)return json({ok:false,error:'There is no active escalation to pick up.'},{status:404});
  if(!escalation.awaitingPickup)return json({ok:false,error:'This escalation has already been picked up.'},{status:409});
  if(!roleMatchesTarget(session.role_name,escalation.targetRole))return json({ok:false,error:`This escalation requires the ${escalation.targetRole} role.`},{status:403});

  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE live_support_escalations SET target_user_id=?,picked_up_by_user_id=?,picked_up_at=? WHERE id=? AND status='active' AND picked_up_at IS NULL`).bind(session.user_id,session.user_id,now,escalation.id),
    env.DB.prepare(`UPDATE tickets SET assigned_to_user_id=?,status='In Progress',updated_at=? WHERE id=? AND status!='Closed'`).bind(session.user_id,now,id),
    env.DB.prepare(`DELETE FROM live_support_typing WHERE ticket_id=?`).bind(id)
  ]);
  try{await audit(env,session,id,'live_support_escalation_picked_up',{escalationId:escalation.id,targetRole:escalation.targetRole,pickedUpByUserId:session.user_id,pickedUpByName:firstName(session.display_name||session.email)});}catch(error){console.error('Live support escalation pickup audit failed',error);}
  return json({ok:true,escalation:await getEscalation(env,id)},{status:200});
}

export async function handleLiveSupportEscalationRoute(request,env){
  const pathname=new URL(request.url).pathname;
  const pickupMatch=pathname.match(/^\/api\/staff\/live-support\/tickets\/([^/]+)\/escalation\/pickup$/);
  const escalationMatch=pathname.match(/^\/api\/staff\/live-support\/tickets\/([^/]+)\/escalation$/);
  const match=pickupMatch||escalationMatch;
  if(!match)return null;
  if(!env.DB)return json({ok:false,error:'The Aria database is not connected.'},{status:503});
  const session=await currentStaff(request,env);
  if(!session||session.account_type!=='staff'||session.status!=='active')return json({ok:false,error:'Staff authentication required.'},{status:401});
  const id=decodeURIComponent(match[1]);
  const t=await ticket(env,id);
  if(!t)return json({ok:false,error:'Member Communication item not found.'},{status:404});

  if(pickupMatch){
    if(request.method!=='POST')return json({ok:false,error:'Method not allowed.'},{status:405});
    return pickupEscalation(env,session,id,t);
  }

  if(request.method==='GET')return json({ok:true,escalation:await getEscalation(env,id)});
  if(request.method==='POST')return createEscalation(request,env,session,id,t);
  return json({ok:false,error:'Method not allowed.'},{status:405});
}
