import { ensureOpenConversation, appendConversationMessage, loadConversationMessages } from './member-conversations-api.js';

function json(data,init={}){
  return new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}});
}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){const raw=request.headers.get('cookie')||'';return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));}
function normalized(value){return String(value||'').trim().toLowerCase();}
function firstName(value){return String(value||'').trim().split(/\s+/)[0].slice(0,40);}
function uuid(prefix){return `${prefix}-${crypto.randomUUID()}`;}
async function readBody(request){try{return await request.json();}catch{return null;}}

async function currentSession(request,env){
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

function isSpecialist(session){return normalized(session?.role_name)==='live support specialist'&&normalized(session?.department)==='operations';}
function isOversightResponder(session){return ['founder','founder / co-founder','co-founder','supervisor of live support','lead supervisor','supervisor'].includes(normalized(session?.role_name));}
function isReviewRole(session){return isOversightResponder(session)||['hr','human resources'].includes(normalized(session?.role_name));}
function canRespondToActiveTicket(session,ticket){
  if(!ticket||ticket.status==='Closed')return false;
  const owns=Boolean(ticket.assigned_to_user_id&&ticket.assigned_to_user_id===session.user_id);
  return (owns&&(isSpecialist(session)||isOversightResponder(session)))||isOversightResponder(session);
}
function canCloseActiveTicket(session,ticket){
  if(!ticket||ticket.status==='Closed')return false;
  if(isOversightResponder(session))return true;
  return isSpecialist(session)&&ticket.assigned_to_user_id===session.user_id;
}

async function ticketById(env,id){
  return env.DB.prepare(`
    SELECT t.*,member.display_name AS member_name,member.email AS member_email,
      staff.display_name AS staff_name,staff.email AS staff_email
    FROM tickets t
    LEFT JOIN users member ON member.id=t.created_by_user_id
    LEFT JOIN users staff ON staff.id=t.assigned_to_user_id
    WHERE t.id=? AND t.department='Operations' AND t.category='Member Communication'
    LIMIT 1
  `).bind(id).first();
}

async function activeMemberTicket(env,userId){
  return env.DB.prepare(`
    SELECT t.*,staff.display_name AS staff_name,staff.email AS staff_email
    FROM tickets t LEFT JOIN users staff ON staff.id=t.assigned_to_user_id
    WHERE t.created_by_user_id=? AND t.department='Operations' AND t.category='Member Communication' AND t.status!='Closed'
    ORDER BY t.updated_at DESC LIMIT 1
  `).bind(userId).first();
}

async function activeEscalation(env,ticketId){
  if(!ticketId)return null;
  try{
    const row=await env.DB.prepare(`
      SELECT e.id,e.target_role,e.target_user_id,e.reason,e.created_at,
        target.display_name AS target_name,target.email AS target_email
      FROM live_support_escalations e
      LEFT JOIN users target ON target.id=e.target_user_id
      WHERE e.ticket_id=? AND e.status='active'
      ORDER BY e.created_at DESC LIMIT 1
    `).bind(ticketId).first();
    return row?{
      id:row.id,
      targetRole:row.target_role,
      targetUserId:row.target_user_id||null,
      targetName:firstName(row.target_name||row.target_email||row.target_role),
      reason:row.reason,
      createdAt:row.created_at
    }:null;
  }catch(error){
    console.error('Live support escalation state failed',error);
    return null;
  }
}

async function conversationForMember(env,userId,{create=false}={}){
  if(create)return ensureOpenConversation(env,userId);
  const open=await env.DB.prepare(`SELECT id,member_user_id,status,started_at,last_message_at,closed_at FROM member_conversations WHERE member_user_id=? AND status='open' ORDER BY last_message_at DESC LIMIT 1`).bind(userId).first();
  if(open)return open;
  return env.DB.prepare(`SELECT id,member_user_id,status,started_at,last_message_at,closed_at FROM member_conversations WHERE member_user_id=? ORDER BY last_message_at DESC LIMIT 1`).bind(userId).first();
}

async function audit(env,{eventType,actorUserId,memberUserId,ticketId,messageId=null,details={}}){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at) VALUES (?, 'Member Communication', ?, ?, 'member', ?, ?, ?, ?, ?)`)
    .bind(uuid('AUD'),eventType,actorUserId||null,memberUserId||null,ticketId||null,JSON.stringify({messageId,...details}),now,now).run();
}

async function typingState(env,ticket){
  if(!ticket?.id||!ticket?.assigned_to_user_id)return {typing:false,typingName:null};
  const now=new Date().toISOString();
  const row=await env.DB.prepare(`
    SELECT p.staff_user_id,u.display_name,u.email
    FROM live_support_typing p
    LEFT JOIN users u ON u.id=p.staff_user_id
    WHERE p.ticket_id=? AND p.staff_user_id=? AND p.expires_at>?
    LIMIT 1
  `).bind(ticket.id,ticket.assigned_to_user_id,now).first();
  return row?{typing:true,typingName:firstName(row.display_name||row.email)}:{typing:false,typingName:null};
}

async function clearTyping(env,ticketId){
  try{await env.DB.prepare(`DELETE FROM live_support_typing WHERE ticket_id=?`).bind(ticketId).run();}catch(error){console.error('Live support typing cleanup failed',error);}
}

async function ensureOversightAssignment(env,session,ticket){
  if(!isOversightResponder(session)||ticket.assigned_to_user_id||ticket.status==='Closed')return ticket;
  const now=new Date().toISOString();
  await env.DB.prepare(`
    UPDATE tickets
    SET assigned_to_user_id=?,status='In Progress',progress=CASE WHEN progress=0 THEN 25 ELSE progress END,updated_at=?
    WHERE id=? AND assigned_to_user_id IS NULL AND status!='Closed'
  `).bind(session.user_id,now,ticket.id).run();
  try{await audit(env,{eventType:'live_support_oversight_joined',actorUserId:session.user_id,memberUserId:ticket.created_by_user_id,ticketId:ticket.id,details:{role:session.role_name}});}catch(error){console.error('Live support oversight join audit failed',error);}
  return await ticketById(env,ticket.id);
}

async function memberState(request,env,session){
  const ticket=await activeMemberTicket(env,session.user_id);
  if(!ticket)return json({ok:true,active:false,waiting:false,assigned:false,displayName:null,agentTyping:false,typingName:null,escalation:null,messages:[]});
  if(!ticket.assigned_to_user_id){
    return json({ok:true,active:false,waiting:true,assigned:false,ticketId:ticket.id,displayName:null,agentTyping:false,typingName:null,escalation:await activeEscalation(env,ticket.id),messages:[]});
  }
  const conversation=await conversationForMember(env,session.user_id,{create:false});
  const data=conversation?await loadConversationMessages(env,session.user_id,conversation.id,100):{conversation:null,messages:[]};
  const typing=await typingState(env,ticket);
  const escalation=await activeEscalation(env,ticket.id);
  return json({ok:true,active:true,waiting:false,assigned:true,ticketId:ticket.id,displayName:firstName(ticket.staff_name||ticket.staff_email),agentTyping:typing.typing,typingName:typing.typingName,escalation,conversation:data.conversation,messages:data.messages});
}

async function memberSend(request,env,session){
  const ticket=await activeMemberTicket(env,session.user_id);
  if(!ticket||!ticket.assigned_to_user_id)return json({ok:false,error:'A live support specialist is not connected yet.'},{status:409});
  const body=await readBody(request);const content=String(body?.content||'').trim();
  if(!content)return json({ok:false,error:'A message is required.'},{status:400});
  if(content.length>4000)return json({ok:false,error:'Please shorten the message and try again.'},{status:400});
  const conversation=await ensureOpenConversation(env,session.user_id);
  const message=await appendConversationMessage(env,{conversationId:conversation.id,userId:session.user_id,role:'member',content,source:'member',riskLevel:null});
  try{await audit(env,{eventType:'live_support_member_message_sent',actorUserId:session.user_id,memberUserId:session.user_id,ticketId:ticket.id,messageId:message?.id});}catch(error){console.error('Live support member message audit failed',error);}
  return json({ok:true,ticketId:ticket.id,conversationId:conversation.id,message},{status:201});
}

async function staffConversation(request,env,session,id,url){
  const ticket=await ticketById(env,id);if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  const owns=Boolean(ticket.assigned_to_user_id&&ticket.assigned_to_user_id===session.user_id);
  const reviewer=isReviewRole(session);
  if(!owns&&!reviewer)return json({ok:false,error:'You may only view a Live Support conversation assigned to you.'},{status:403});
  const conversation=await conversationForMember(env,ticket.created_by_user_id,{create:false});
  const data=conversation?await loadConversationMessages(env,ticket.created_by_user_id,conversation.id,100):{conversation:null,messages:[]};
  const canSend=canRespondToActiveTicket(session,ticket);
  if(url.searchParams.get('poll')!=='1'){
    try{await audit(env,{eventType:'live_support_conversation_opened',actorUserId:session.user_id,memberUserId:ticket.created_by_user_id,ticketId:id,details:{readOnly:!canSend}});}catch(error){console.error('Live support conversation open audit failed',error);}
  }
  return json({ok:true,ticket:{id:ticket.id,status:ticket.status,memberName:ticket.member_name||ticket.member_email||'Member',assignedTo:firstName(ticket.staff_name||ticket.staff_email)},conversation:data.conversation,messages:data.messages,canSend,readOnly:!canSend});
}

async function staffTyping(request,env,session,id){
  let ticket=await ticketById(env,id);if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  if(ticket.status==='Closed')return json({ok:false,error:'This Live Support conversation is closed.'},{status:409});
  if(!canRespondToActiveTicket(session,ticket))return json({ok:false,error:'You do not have permission to respond in this active Live Support conversation.'},{status:403});
  ticket=await ensureOversightAssignment(env,session,ticket);
  const body=await readBody(request);
  const typing=Boolean(body?.typing);
  if(!typing){await clearTyping(env,id);return json({ok:true,typing:false});}
  const now=new Date();
  const expires=new Date(now.getTime()+6000).toISOString();
  await env.DB.prepare(`
    INSERT INTO live_support_typing (ticket_id,staff_user_id,expires_at,updated_at)
    VALUES (?,?,?,?)
    ON CONFLICT(ticket_id) DO UPDATE SET staff_user_id=excluded.staff_user_id,expires_at=excluded.expires_at,updated_at=excluded.updated_at
  `).bind(id,session.user_id,expires,now.toISOString()).run();
  return json({ok:true,typing:true,displayName:firstName(session.display_name||session.email),expiresAt:expires});
}

async function staffSend(request,env,session,id){
  let ticket=await ticketById(env,id);if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  if(ticket.status==='Closed')return json({ok:false,error:'This Live Support conversation is closed and can only be reviewed.'},{status:409});
  if(!canRespondToActiveTicket(session,ticket))return json({ok:false,error:'You do not have permission to respond in this active Live Support conversation.'},{status:403});
  ticket=await ensureOversightAssignment(env,session,ticket);

  const body=await readBody(request);const content=String(body?.content||'').trim();
  if(!content)return json({ok:false,error:'A message is required.'},{status:400});
  if(content.length>4000)return json({ok:false,error:'Please shorten the message and try again.'},{status:400});
  const conversation=await ensureOpenConversation(env,ticket.created_by_user_id);
  const senderName=firstName(session.display_name||session.email)||'Support';
  const message=await appendConversationMessage(env,{conversationId:conversation.id,userId:ticket.created_by_user_id,role:'staff',content,source:`staff:${senderName}`,riskLevel:null});
  await clearTyping(env,id);
  try{await audit(env,{eventType:'live_support_staff_message_sent',actorUserId:session.user_id,memberUserId:ticket.created_by_user_id,ticketId:id,messageId:message?.id,details:{role:session.role_name,senderName}});}catch(error){console.error('Live support staff message audit failed',error);}
  return json({ok:true,ticketId:id,conversationId:conversation.id,message},{status:201});
}

async function staffClose(env,session,id){
  const ticket=await ticketById(env,id);if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  if(ticket.status==='Closed')return json({ok:true,closed:true,ticketId:id,alreadyClosed:true});
  if(!canCloseActiveTicket(session,ticket))return json({ok:false,error:'You are not authorized to close this Live Support conversation.'},{status:403});
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE tickets SET status='Closed',progress=100,updated_at=? WHERE id=? AND status!='Closed'`).bind(now,id).run();
  await clearTyping(env,id);
  const incident=await env.DB.prepare(`SELECT id,member_user_id,current_risk_level FROM lifeline_incidents WHERE related_ticket_id=? AND status!='closed' ORDER BY updated_at DESC LIMIT 1`).bind(id).first();
  if(incident){
    await env.DB.batch([
      env.DB.prepare(`UPDATE lifeline_incidents SET status='closed',updated_at=? WHERE id=?`).bind(now,incident.id),
      env.DB.prepare(`INSERT INTO lifeline_events (id,incident_id,member_user_id,event_type,risk_level,actor_type,actor_user_id,details_json,occurred_at,recorded_at) VALUES (?,?,?,?,?,'staff',?,?,?,?)`)
        .bind(uuid('LFLE'),incident.id,incident.member_user_id,'human_support_closed',incident.current_risk_level||null,session.user_id,JSON.stringify({ticketId:id,progress:100,role:session.role_name}),now,now)
    ]);
  }
  try{await audit(env,{eventType:'live_support_conversation_closed',actorUserId:session.user_id,memberUserId:ticket.created_by_user_id,ticketId:id,details:{role:session.role_name}});}catch(error){console.error('Live support close audit failed',error);}
  return json({ok:true,closed:true,ticketId:id,status:'Closed',progress:100,updatedAt:now});
}

export async function handleLiveSupportChatRoute(request,env){
  const url=new URL(request.url);
  const memberRoute=url.pathname==='/api/member/lifeline/live-chat'||url.pathname==='/api/member/lifeline/live-chat/messages';
  const staffMatch=url.pathname.match(/^\/api\/staff\/live-support\/tickets\/([^/]+)\/(conversation|messages|typing|close)$/);
  if(!memberRoute&&!staffMatch)return null;
  if(!env.DB)return json({ok:false,error:'The Aria database is not connected.'},{status:503});
  const session=await currentSession(request,env);
  if(!session||session.status!=='active')return json({ok:false,error:'Authentication required.'},{status:401});

  try{
    if(memberRoute){
      if(session.account_type!=='member')return json({ok:false,error:'Member authentication required.'},{status:403});
      if(url.pathname==='/api/member/lifeline/live-chat'&&request.method==='GET')return memberState(request,env,session);
      if(url.pathname==='/api/member/lifeline/live-chat/messages'&&request.method==='POST')return memberSend(request,env,session);
      return json({ok:false,error:'Method not allowed.'},{status:405});
    }

    if(session.account_type!=='staff')return json({ok:false,error:'Staff authentication required.'},{status:403});
    const id=decodeURIComponent(staffMatch[1]);
    if(staffMatch[2]==='conversation'&&request.method==='GET')return staffConversation(request,env,session,id,url);
    if(staffMatch[2]==='messages'&&request.method==='POST')return staffSend(request,env,session,id);
    if(staffMatch[2]==='typing'&&request.method==='POST')return staffTyping(request,env,session,id);
    if(staffMatch[2]==='close'&&request.method==='POST')return staffClose(env,session,id);
    return json({ok:false,error:'Method not allowed.'},{status:405});
  }catch(error){
    console.error('Live support chat route failed',error);
    return json({ok:false,error:'Live Support chat is unavailable right now.'},{status:500});
  }
}