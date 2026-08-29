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
function isReviewRole(session){return ['founder','founder / co-founder','co-founder','supervisor of live support','hr','human resources'].includes(normalized(session?.role_name));}

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

async function memberState(request,env,session){
  const ticket=await activeMemberTicket(env,session.user_id);
  if(!ticket)return json({ok:true,active:false,waiting:false,assigned:false,displayName:null,messages:[]});
  if(!ticket.assigned_to_user_id){
    return json({ok:true,active:false,waiting:true,assigned:false,ticketId:ticket.id,displayName:null,messages:[]});
  }
  const conversation=await conversationForMember(env,session.user_id,{create:false});
  const data=conversation?await loadConversationMessages(env,session.user_id,conversation.id,100):{conversation:null,messages:[]};
  return json({ok:true,active:true,waiting:false,assigned:true,ticketId:ticket.id,displayName:firstName(ticket.staff_name||ticket.staff_email),conversation:data.conversation,messages:data.messages});
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
  const canSend=owns&&isSpecialist(session)&&ticket.status!=='Closed';
  if(url.searchParams.get('poll')!=='1'){
    try{await audit(env,{eventType:'live_support_conversation_opened',actorUserId:session.user_id,memberUserId:ticket.created_by_user_id,ticketId:id,details:{readOnly:!canSend}});}catch(error){console.error('Live support conversation open audit failed',error);}
  }
  return json({ok:true,ticket:{id:ticket.id,status:ticket.status,memberName:ticket.member_name||ticket.member_email||'Member',assignedTo:firstName(ticket.staff_name||ticket.staff_email)},conversation:data.conversation,messages:data.messages,canSend,readOnly:!canSend});
}

async function staffSend(request,env,session,id){
  const ticket=await ticketById(env,id);if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  if(ticket.status==='Closed')return json({ok:false,error:'This Live Support conversation is closed.'},{status:409});
  if(!isSpecialist(session)||ticket.assigned_to_user_id!==session.user_id)return json({ok:false,error:'Only the assigned Live Support Specialist can send messages in this conversation.'},{status:403});
  const body=await readBody(request);const content=String(body?.content||'').trim();
  if(!content)return json({ok:false,error:'A message is required.'},{status:400});
  if(content.length>4000)return json({ok:false,error:'Please shorten the message and try again.'},{status:400});
  const conversation=await ensureOpenConversation(env,ticket.created_by_user_id);
  const message=await appendConversationMessage(env,{conversationId:conversation.id,userId:ticket.created_by_user_id,role:'staff',content,source:'staff',riskLevel:null});
  try{await audit(env,{eventType:'live_support_staff_message_sent',actorUserId:session.user_id,memberUserId:ticket.created_by_user_id,ticketId:id,messageId:message?.id});}catch(error){console.error('Live support staff message audit failed',error);}
  return json({ok:true,ticketId:id,conversationId:conversation.id,message},{status:201});
}

export async function handleLiveSupportChatRoute(request,env){
  const url=new URL(request.url);
  const memberRoute=url.pathname==='/api/member/lifeline/live-chat'||url.pathname==='/api/member/lifeline/live-chat/messages';
  const staffMatch=url.pathname.match(/^\/api\/staff\/live-support\/tickets\/([^/]+)\/(conversation|messages)$/);
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
    return json({ok:false,error:'Method not allowed.'},{status:405});
  }catch(error){
    console.error('Live support chat route failed',error);
    return json({ok:false,error:'Live Support chat is unavailable right now.'},{status:500});
  }
}
