function json(data,init={}){
  return new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}});
}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){const raw=request.headers.get('cookie')||'';return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));}
function uuid(prefix){return `${prefix}-${crypto.randomUUID()}`;}
function norm(value){return String(value||'').trim().toLowerCase();}
function clean(value,max=1000){return String(value||'').trim().slice(0,max);}
async function body(request){try{return await request.json();}catch{return {};}}

const PRIVILEGED_ROLES=['founder','lead supervisor','supervisor of live support'];
const REVIEW_ROLES=['founder','lead supervisor','privacy officer','compliance officer','security lead','security administrator'];
const ALLOWED_SCOPES=['lifeline_history','conversation_transcript','medication_summary'];
const ACCESS_MINUTES=15;

async function currentStaff(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.email,u.display_name,u.account_type,u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS role_name,
      (SELECT department FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS department
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}
function isSpecialist(session){return norm(session?.role_name)==='live support specialist'&&norm(session?.department)==='operations';}
function canInvoke(session){return PRIVILEGED_ROLES.includes(norm(session?.role_name))||isSpecialist(session);}
function canReview(session){return REVIEW_ROLES.includes(norm(session?.role_name));}

async function requireStaff(request,env){
  const session=await currentStaff(request,env);
  if(!session||session.account_type!=='staff'||session.status!=='active')return {error:json({ok:false,error:'Authentication required.'},{status:401})};
  return {session};
}

async function recordEvent(env,grant,actor,eventType,details={}){
  const now=new Date().toISOString();
  const safeDetails={grantId:grant.id,memberUserId:grant.member_user_id,relatedTicketId:grant.related_ticket_id||null,relatedIncidentId:grant.related_incident_id||null,...details};
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO break_glass_access_events (id,grant_id,event_type,actor_user_id,details_json,occurred_at,recorded_at) VALUES (?,?,?,?,?,?,?)`)
      .bind(uuid('BGE'),grant.id,eventType,actor.user_id,JSON.stringify(safeDetails),now,now),
    env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at) VALUES (?,'Break Glass',? ,?,'member',?,?,?, ?,?)`)
      .bind(uuid('AUD'),eventType,actor.user_id,grant.member_user_id,grant.related_ticket_id||null,JSON.stringify(safeDetails),now,now)
  ]);
}

async function targetMember(env,memberUserId){
  return env.DB.prepare(`SELECT id,email,display_name,status FROM users WHERE id=? AND account_type='member' LIMIT 1`).bind(memberUserId).first();
}

async function validateContext(env,session,memberUserId,relatedTicketId,relatedIncidentId){
  let ticket=null,incident=null;
  if(relatedTicketId){
    ticket=await env.DB.prepare(`SELECT id,created_by_user_id,assigned_to_user_id,status,department,category FROM tickets WHERE id=? LIMIT 1`).bind(relatedTicketId).first();
    if(!ticket||ticket.created_by_user_id!==memberUserId)return {error:'The referenced ticket does not belong to this member.'};
    if(ticket.department!=='Operations'||ticket.category!=='Member Communication')return {error:'Break Glass requires a Member Communication support ticket.'};
  }
  if(relatedIncidentId){
    incident=await env.DB.prepare(`SELECT id,member_user_id,related_ticket_id,status,current_risk_level FROM lifeline_incidents WHERE id=? LIMIT 1`).bind(relatedIncidentId).first();
    if(!incident||incident.member_user_id!==memberUserId)return {error:'The referenced Lifeline incident does not belong to this member.'};
  }
  if(!ticket&&!incident)return {error:'A related Lifeline incident or Member Communication ticket is required.'};
  if(ticket&&ticket.status==='Closed'&&(!incident||incident.status==='closed'))return {error:'Break Glass cannot be opened for a fully closed support event.'};
  if(incident&&incident.status==='closed'&&(!ticket||ticket.status==='Closed'))return {error:'Break Glass cannot be opened for a fully closed Lifeline event.'};

  if(isSpecialist(session)){
    const effectiveTicket=ticket||(incident?.related_ticket_id?await env.DB.prepare(`SELECT id,created_by_user_id,assigned_to_user_id,status,department,category FROM tickets WHERE id=? LIMIT 1`).bind(incident.related_ticket_id).first():null);
    if(!effectiveTicket||effectiveTicket.created_by_user_id!==memberUserId||effectiveTicket.assigned_to_user_id!==session.user_id||effectiveTicket.status==='Closed'){
      return {error:'Live Support Specialists may use Break Glass only for an active Member Communication case assigned to them.'};
    }
  }
  return {ticket,incident};
}

async function listTargets(request,env,session){
  if(!canInvoke(session))return json({ok:false,error:'Break Glass access is not available for this staff role.'},{status:403});
  if(isSpecialist(session)){
    const result=await env.DB.prepare(`
      SELECT DISTINCT u.id,u.display_name,u.email,t.id AS ticket_id,li.id AS incident_id
      FROM tickets t
      JOIN users u ON u.id=t.created_by_user_id
      LEFT JOIN lifeline_incidents li ON li.related_ticket_id=t.id AND li.status!='closed'
      WHERE t.department='Operations' AND t.category='Member Communication' AND t.status!='Closed' AND t.assigned_to_user_id=?
      ORDER BY t.updated_at DESC LIMIT 25
    `).bind(session.user_id).all();
    return json({ok:true,targets:result.results||[],restrictedToAssignedCases:true});
  }
  const q=clean(new URL(request.url).searchParams.get('q'),120);
  if(q.length<2)return json({ok:true,targets:[],requiresQuery:true});
  const term=`%${q}%`;
  const result=await env.DB.prepare(`
    SELECT id,display_name,email FROM users
    WHERE account_type='member' AND status='active' AND (id LIKE ? OR display_name LIKE ? OR email LIKE ?)
    ORDER BY display_name COLLATE NOCASE LIMIT 15
  `).bind(term,term,term).all();
  return json({ok:true,targets:result.results||[],restrictedToAssignedCases:false});
}

async function activeGrant(env,actorUserId,memberUserId){
  const now=new Date().toISOString();
  return env.DB.prepare(`
    SELECT * FROM break_glass_access_grants
    WHERE actor_user_id=? AND member_user_id=? AND revoked_at IS NULL AND expires_at>?
    ORDER BY started_at DESC LIMIT 1
  `).bind(actorUserId,memberUserId,now).first();
}

async function activate(request,env,session){
  if(!canInvoke(session))return json({ok:false,error:'Break Glass access is not available for this staff role.'},{status:403});
  const data=await body(request);
  const memberUserId=clean(data.memberUserId,120);
  const reason=clean(data.reason,1000);
  const relatedTicketId=clean(data.relatedTicketId,120)||null;
  const relatedIncidentId=clean(data.relatedIncidentId,120)||null;
  const scopes=[...new Set((Array.isArray(data.scopes)?data.scopes:[]).map(String).filter(v=>ALLOWED_SCOPES.includes(v)))];
  if(!memberUserId)return json({ok:false,error:'Member is required.'},{status:400});
  if(reason.length<20)return json({ok:false,error:'A specific emergency justification of at least 20 characters is required.'},{status:400});
  if(!scopes.length)return json({ok:false,error:'Choose at least one emergency-access scope.'},{status:400});
  if(data.acknowledged!==true)return json({ok:false,error:'You must acknowledge that Break Glass access is temporary, monitored, and reviewable.'},{status:400});
  const member=await targetMember(env,memberUserId);
  if(!member||member.status!=='active')return json({ok:false,error:'Active member not found.'},{status:404});
  const context=await validateContext(env,session,memberUserId,relatedTicketId,relatedIncidentId);
  if(context.error)return json({ok:false,error:context.error},{status:403});
  const existing=await activeGrant(env,session.user_id,memberUserId);
  if(existing)return json({ok:false,error:'An active Break Glass grant already exists for this member.',grant:grantShape(existing)},{status:409});

  const now=new Date();
  const startedAt=now.toISOString();
  const expiresAt=new Date(now.getTime()+ACCESS_MINUTES*60000).toISOString();
  const grant={id:uuid('BG'),actor_user_id:session.user_id,member_user_id:memberUserId,reason,scope_json:JSON.stringify(scopes),related_ticket_id:relatedTicketId,related_incident_id:relatedIncidentId,started_at:startedAt,expires_at:expiresAt};
  await env.DB.prepare(`
    INSERT INTO break_glass_access_grants
    (id,actor_user_id,member_user_id,reason,scope_json,related_ticket_id,related_incident_id,started_at,expires_at,review_status,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,'pending',?)
  `).bind(grant.id,grant.actor_user_id,grant.member_user_id,grant.reason,grant.scope_json,grant.related_ticket_id,grant.related_incident_id,grant.started_at,grant.expires_at,startedAt).run();
  await recordEvent(env,grant,session,'break_glass_activated',{scopes,reasonLength:reason.length,expiresAt,actorRole:session.role_name,actorDepartment:session.department});
  return json({ok:true,grant:{...grantShape(grant),member:{id:member.id,name:member.display_name||member.email,email:member.email}},expiresInSeconds:ACCESS_MINUTES*60},{status:201});
}

function grantShape(row){
  const scopes=(()=>{try{return JSON.parse(row.scope_json||'[]');}catch{return [];}})();
  const now=Date.now();
  const expires=new Date(row.expires_at).getTime();
  return {id:row.id,memberUserId:row.member_user_id,reason:row.reason,scopes,relatedTicketId:row.related_ticket_id||null,relatedIncidentId:row.related_incident_id||null,startedAt:row.started_at,expiresAt:row.expires_at,revokedAt:row.revoked_at||null,active:!row.revoked_at&&Number.isFinite(expires)&&expires>now,reviewStatus:row.review_status||'pending',reviewedAt:row.reviewed_at||null,reviewNotes:row.review_notes||null};
}

async function status(request,env,session){
  if(!canInvoke(session))return json({ok:false,error:'Break Glass access is not available for this staff role.'},{status:403});
  const memberUserId=clean(new URL(request.url).searchParams.get('memberUserId'),120);
  if(!memberUserId)return json({ok:true,active:false,grant:null});
  const grant=await activeGrant(env,session.user_id,memberUserId);
  return json({ok:true,active:Boolean(grant),grant:grant?grantShape(grant):null});
}

async function snapshot(request,env,session){
  if(!canInvoke(session))return json({ok:false,error:'Break Glass access is not available for this staff role.'},{status:403});
  const memberUserId=clean(new URL(request.url).searchParams.get('memberUserId'),120);
  const grant=memberUserId?await activeGrant(env,session.user_id,memberUserId):null;
  if(!grant)return json({ok:false,error:'No active Break Glass grant exists for this member.'},{status:403});
  const scopes=grantShape(grant).scopes;
  const member=await targetMember(env,memberUserId);
  const result={ok:true,grant:grantShape(grant),member:{id:member?.id,name:member?.display_name||member?.email||'Member',email:member?.email||''},medications:null,conversation:null,lifeline:null};
  const counts={};

  if(scopes.includes('medication_summary')){
    const meds=await env.DB.prepare(`SELECT id,name,dose_text,notes,updated_at FROM member_medications WHERE member_user_id=? AND active=1 ORDER BY name COLLATE NOCASE LIMIT 100`).bind(memberUserId).all();
    result.medications=meds.results||[];counts.medications=result.medications.length;
  }
  if(scopes.includes('conversation_transcript')){
    const messages=await env.DB.prepare(`
      SELECT id,conversation_id,role,content,risk_level,created_at FROM member_conversation_messages
      WHERE member_user_id=? ORDER BY created_at DESC LIMIT 100
    `).bind(memberUserId).all();
    result.conversation=(messages.results||[]).reverse();counts.messages=result.conversation.length;
  }
  if(scopes.includes('lifeline_history')){
    const incidents=await env.DB.prepare(`SELECT id,status,highest_risk_level,current_risk_level,source,related_ticket_id,started_at,last_signal_at,closed_at,updated_at FROM lifeline_incidents WHERE member_user_id=? ORDER BY updated_at DESC LIMIT 20`).bind(memberUserId).all();
    const events=await env.DB.prepare(`SELECT id,incident_id,event_type,risk_level,actor_type,occurred_at FROM lifeline_events WHERE member_user_id=? ORDER BY occurred_at DESC LIMIT 100`).bind(memberUserId).all();
    result.lifeline={incidents:incidents.results||[],events:events.results||[]};counts.incidents=result.lifeline.incidents.length;counts.events=result.lifeline.events.length;
  }
  await recordEvent(env,grant,session,'break_glass_data_viewed',{scopes,counts});
  return json(result);
}

async function revoke(request,env,session,grantId){
  const grant=await env.DB.prepare(`SELECT * FROM break_glass_access_grants WHERE id=? LIMIT 1`).bind(grantId).first();
  if(!grant)return json({ok:false,error:'Break Glass grant not found.'},{status:404});
  if(grant.actor_user_id!==session.user_id&&!canReview(session))return json({ok:false,error:'You cannot revoke this Break Glass grant.'},{status:403});
  if(grant.revoked_at)return json({ok:true,grant:grantShape(grant)});
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE break_glass_access_grants SET revoked_at=?,revoked_by_user_id=? WHERE id=? AND revoked_at IS NULL`).bind(now,session.user_id,grantId).run();
  grant.revoked_at=now;
  await recordEvent(env,grant,session,'break_glass_revoked',{revokedByRole:session.role_name});
  return json({ok:true,grant:grantShape(grant)});
}

async function reviews(env,session){
  if(!canReview(session))return json({ok:false,error:'Break Glass review is restricted to authorized security/compliance reviewers.'},{status:403});
  const rows=await env.DB.prepare(`
    SELECT g.*,actor.display_name AS actor_name,actor.email AS actor_email,member.display_name AS member_name,member.email AS member_email,
      reviewer.display_name AS reviewer_name,reviewer.email AS reviewer_email
    FROM break_glass_access_grants g
    JOIN users actor ON actor.id=g.actor_user_id JOIN users member ON member.id=g.member_user_id
    LEFT JOIN users reviewer ON reviewer.id=g.reviewed_by_user_id
    ORDER BY g.started_at DESC LIMIT 100
  `).all();
  return json({ok:true,reviews:(rows.results||[]).map(row=>({...grantShape(row),actor:{id:row.actor_user_id,name:row.actor_name||row.actor_email,email:row.actor_email},member:{id:row.member_user_id,name:row.member_name||row.member_email,email:row.member_email},reviewer:row.reviewed_by_user_id?{id:row.reviewed_by_user_id,name:row.reviewer_name||row.reviewer_email,email:row.reviewer_email}:null}))});
}

async function reviewGrant(request,env,session,grantId){
  if(!canReview(session))return json({ok:false,error:'Break Glass review is restricted to authorized security/compliance reviewers.'},{status:403});
  const grant=await env.DB.prepare(`SELECT * FROM break_glass_access_grants WHERE id=? LIMIT 1`).bind(grantId).first();
  if(!grant)return json({ok:false,error:'Break Glass grant not found.'},{status:404});
  const shaped=grantShape(grant);
  if(shaped.active)return json({ok:false,error:'Wait until the Break Glass grant expires or is revoked before completing review.'},{status:409});
  const data=await body(request);const notes=clean(data.notes,1200);
  if(notes.length<10)return json({ok:false,error:'Review notes of at least 10 characters are required.'},{status:400});
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE break_glass_access_grants SET review_status='reviewed',reviewed_by_user_id=?,reviewed_at=?,review_notes=? WHERE id=?`).bind(session.user_id,now,notes,grantId).run();
  grant.review_status='reviewed';grant.reviewed_by_user_id=session.user_id;grant.reviewed_at=now;grant.review_notes=notes;
  await recordEvent(env,grant,session,'break_glass_review_completed',{reviewNotesLength:notes.length,reviewerRole:session.role_name});
  return json({ok:true,grant:grantShape(grant)});
}

export async function handleBreakGlassRoute(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/staff/break-glass'))return null;
  const auth=await requireStaff(request,env);if(auth.error)return auth.error;const session=auth.session;
  if(url.pathname==='/api/staff/break-glass/targets'&&request.method==='GET')return listTargets(request,env,session);
  if(url.pathname==='/api/staff/break-glass/activate'&&request.method==='POST')return activate(request,env,session);
  if(url.pathname==='/api/staff/break-glass/status'&&request.method==='GET')return status(request,env,session);
  if(url.pathname==='/api/staff/break-glass/snapshot'&&request.method==='GET')return snapshot(request,env,session);
  if(url.pathname==='/api/staff/break-glass/reviews'&&request.method==='GET')return reviews(env,session);
  const revokeMatch=url.pathname.match(/^\/api\/staff\/break-glass\/grants\/([^/]+)\/revoke$/);
  if(revokeMatch&&request.method==='POST')return revoke(request,env,session,decodeURIComponent(revokeMatch[1]));
  const reviewMatch=url.pathname.match(/^\/api\/staff\/break-glass\/grants\/([^/]+)\/review$/);
  if(reviewMatch&&request.method==='POST')return reviewGrant(request,env,session,decodeURIComponent(reviewMatch[1]));
  return json({ok:false,error:'Break Glass route not found.'},{status:404});
}
