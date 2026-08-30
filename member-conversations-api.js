function json(data,init={}){
  return new Response(JSON.stringify(data),{
    ...init,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      ...(init.headers||{})
    }
  });
}

function bytesToHex(bytes){
  return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
}

async function sha256(value){
  return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));
}

function parseCookies(request){
  const raw=request.headers.get('cookie')||'';
  return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const index=v.indexOf('=');
    return [v.slice(0,index),decodeURIComponent(v.slice(index+1))];
  }));
}

export async function currentConversationMember(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;
  if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.email,u.display_name
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=?
      AND s.revoked_at IS NULL
      AND s.expires_at>?
      AND u.account_type='member'
      AND u.status='active'
    LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}

export async function ensureOpenConversation(env,userId){
  let conversation=await env.DB.prepare(`
    SELECT id,member_user_id,status,started_at,last_message_at
    FROM member_conversations
    WHERE member_user_id=? AND status='open'
    ORDER BY last_message_at DESC
    LIMIT 1
  `).bind(userId).first();

  if(conversation)return conversation;

  const id=crypto.randomUUID();
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO member_conversations(id,member_user_id,status,started_at,last_message_at)
    VALUES(?,?,'open',?,?)
  `).bind(id,userId,now,now).run();

  return {id,member_user_id:userId,status:'open',started_at:now,last_message_at:now};
}

export async function appendConversationMessage(env,{conversationId,userId,role,content,source,riskLevel=null,staffUserId=null}){
  const text=String(content||'').trim();
  if(!text)return null;

  const ownedConversation=await env.DB.prepare(`
    SELECT id,status
    FROM member_conversations
    WHERE id=? AND member_user_id=?
    LIMIT 1
  `).bind(conversationId,userId).first();
  if(!ownedConversation)throw new Error('conversation_not_found');
  if(ownedConversation.status!=='open')throw new Error('conversation_closed');

  const latest=await env.DB.prepare(`
    SELECT id,role,content,source,risk_level,staff_user_id,created_at
    FROM member_conversation_messages
    WHERE conversation_id=? AND member_user_id=?
    ORDER BY created_at DESC
    LIMIT 1
  `).bind(conversationId,userId).first();

  if(latest&&latest.role===role&&latest.source===source&&latest.content===text&&(latest.staff_user_id||null)===(staffUserId||null)){
    const age=Date.now()-new Date(latest.created_at).getTime();
    if(Number.isFinite(age)&&age>=0&&age<=5000){
      return {
        id:latest.id,
        conversationId,
        role:latest.role,
        content:latest.content,
        source:latest.source,
        riskLevel:latest.risk_level||null,
        staffUserId:latest.staff_user_id||null,
        createdAt:latest.created_at,
        duplicate:true
      };
    }
  }

  const id=crypto.randomUUID();
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`
      INSERT INTO member_conversation_messages(
        id,conversation_id,member_user_id,role,content,source,risk_level,staff_user_id,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?)
    `).bind(id,conversationId,userId,role,text,source,riskLevel||null,staffUserId||null,now),
    env.DB.prepare(`
      UPDATE member_conversations SET last_message_at=?
      WHERE id=? AND member_user_id=?
    `).bind(now,conversationId,userId)
  ]);
  return {id,conversationId,role,content:text,source,riskLevel:riskLevel||null,staffUserId:staffUserId||null,createdAt:now,duplicate:false};
}

export async function loadConversationMessages(env,userId,conversationId=null,limit=30){
  let conversation=null;
  if(conversationId){
    conversation=await env.DB.prepare(`
      SELECT id,status,started_at,last_message_at,closed_at
      FROM member_conversations
      WHERE id=? AND member_user_id=?
      LIMIT 1
    `).bind(conversationId,userId).first();
  }else{
    conversation=await env.DB.prepare(`
      SELECT id,status,started_at,last_message_at,closed_at
      FROM member_conversations
      WHERE member_user_id=? AND status='open'
      ORDER BY last_message_at DESC
      LIMIT 1
    `).bind(userId).first();
  }

  if(!conversation)return {conversation:null,messages:[]};
  const safeLimit=Math.max(1,Math.min(Number(limit)||30,100));
  const result=await env.DB.prepare(`
    SELECT * FROM (
      SELECT m.id,m.role,m.content,m.source,m.risk_level,m.staff_user_id,m.created_at,
        staff.display_name AS staff_name,staff.email AS staff_email
      FROM member_conversation_messages m
      LEFT JOIN users staff ON staff.id=m.staff_user_id
      WHERE m.conversation_id=? AND m.member_user_id=?
      ORDER BY m.created_at DESC
      LIMIT ?
    ) recent
    ORDER BY created_at ASC
  `).bind(conversation.id,userId,safeLimit).all();

  return {
    conversation:{
      id:conversation.id,
      status:conversation.status,
      startedAt:conversation.started_at,
      lastMessageAt:conversation.last_message_at,
      closedAt:conversation.closed_at||null
    },
    messages:(result.results||[]).map(row=>({
      id:row.id,
      role:row.role,
      content:row.content,
      source:row.source,
      riskLevel:row.risk_level||null,
      staffUserId:row.staff_user_id||null,
      staffName:row.staff_name||row.staff_email||null,
      createdAt:row.created_at
    }))
  };
}

async function auditConversationClose(env,member,conversationIds,ticketIds){
  if(!conversationIds.length&&!ticketIds.length)return;
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at)
    VALUES (?, 'Member Communication','member_session_closed_on_logout',?,'member',?,?,?,?)
  `).bind(
    `AUD-${crypto.randomUUID()}`,
    member.user_id,
    member.user_id,
    JSON.stringify({conversationIds,ticketIds,conversationCount:conversationIds.length,ticketCount:ticketIds.length,reason:'member_logout'}),
    now,
    now
  ).run();
}

async function closeOpenConversations(env,member){
  const [openConversations,openTickets]=await Promise.all([
    env.DB.prepare(`
      SELECT id
      FROM member_conversations
      WHERE member_user_id=? AND status='open'
      ORDER BY last_message_at DESC
    `).bind(member.user_id).all(),
    env.DB.prepare(`
      SELECT id
      FROM tickets
      WHERE created_by_user_id=?
        AND department='Operations'
        AND category='Member Communication'
        AND status!='Closed'
      ORDER BY updated_at DESC
    `).bind(member.user_id).all()
  ]);

  const conversationIds=(openConversations.results||[]).map(row=>row.id).filter(Boolean);
  const ticketIds=(openTickets.results||[]).map(row=>row.id).filter(Boolean);
  const now=new Date().toISOString();
  const statements=[];

  if(conversationIds.length){
    statements.push(env.DB.prepare(`
      UPDATE member_conversations
      SET status='closed',closed_at=?
      WHERE member_user_id=? AND status='open'
    `).bind(now,member.user_id));
  }

  if(ticketIds.length){
    statements.push(env.DB.prepare(`
      UPDATE tickets
      SET status='Closed',progress=100,updated_at=?
      WHERE created_by_user_id=?
        AND department='Operations'
        AND category='Member Communication'
        AND status!='Closed'
    `).bind(now,member.user_id));

    for(const ticketId of ticketIds){
      statements.push(env.DB.prepare(`DELETE FROM live_support_typing WHERE ticket_id=?`).bind(ticketId));
      statements.push(env.DB.prepare(`
        UPDATE live_support_escalations
        SET status='resolved',resolved_at=?
        WHERE ticket_id=? AND status='active'
      `).bind(now,ticketId));
    }
  }

  const incidents=await env.DB.prepare(`
    SELECT id,current_risk_level,related_ticket_id
    FROM lifeline_incidents
    WHERE member_user_id=? AND status!='closed'
    ORDER BY updated_at DESC
  `).bind(member.user_id).all();

  for(const incident of incidents.results||[]){
    statements.push(env.DB.prepare(`UPDATE lifeline_incidents SET status='closed',updated_at=? WHERE id=?`).bind(now,incident.id));
    statements.push(env.DB.prepare(`
      INSERT INTO lifeline_events
      (id,incident_id,member_user_id,event_type,risk_level,actor_type,actor_user_id,details_json,occurred_at,recorded_at)
      VALUES (?,?,?,?,?,'member',?,?,?,?)
    `).bind(
      `LFLE-${crypto.randomUUID()}`,
      incident.id,
      member.user_id,
      'member_session_ended',
      incident.current_risk_level||null,
      member.user_id,
      JSON.stringify({ticketId:incident.related_ticket_id||null,reason:'member_logout'}),
      now,
      now
    ));
  }

  if(statements.length)await env.DB.batch(statements);
  try{await auditConversationClose(env,member,conversationIds,ticketIds);}catch(error){console.error('Member session close audit failed',error);}

  return json({
    ok:true,
    closed:true,
    conversationIds,
    ticketIds,
    conversationCount:conversationIds.length,
    ticketCount:ticketIds.length,
    closedAt:now
  });
}

async function handleGet(request,env,member,url){
  const data=await loadConversationMessages(
    env,
    member.user_id,
    url.searchParams.get('conversationId')||null,
    url.searchParams.get('limit')||30
  );
  return json({ok:true,...data});
}

async function handleAppend(request,env,member){
  let body=null;
  try{body=await request.json();}catch{}
  const role=body?.role==='assistant'?'assistant':'member';
  const content=String(body?.content||'').trim();
  if(!content)return json({ok:false,error:'A message is required.'},{status:400});
  if(content.length>4000)return json({ok:false,error:'Please shorten the message and try again.'},{status:400});

  const conversation=await ensureOpenConversation(env,member.user_id);
  const message=await appendConversationMessage(env,{
    conversationId:conversation.id,
    userId:member.user_id,
    role,
    content,
    source:role==='assistant'?'assistant_deterministic':'member',
    riskLevel:['normal','concern','high','critical'].includes(body?.riskLevel)?body.riskLevel:null
  });
  return json({ok:true,conversationId:conversation.id,message},{status:201});
}

export async function handleMemberConversationsRoute(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/member/conversations'))return null;
  if(!env.DB)return json({ok:false,error:'The Aria database is not connected.'},{status:503});

  const member=await currentConversationMember(request,env);
  if(!member)return json({ok:false,error:'Member authentication required.'},{status:401});

  try{
    if(url.pathname==='/api/member/conversations/close'&&request.method==='POST')return await closeOpenConversations(env,member);
    if(url.pathname==='/api/member/conversations'&&request.method==='GET')return await handleGet(request,env,member,url);
    if(url.pathname==='/api/member/conversations'&&request.method==='POST')return await handleAppend(request,env,member);
    return json({ok:false,error:'Method not allowed.'},{status:405,headers:{allow:'GET, POST'}});
  }catch(error){
    console.error('Conversation route failed',error);
    return json({ok:false,error:'Conversation storage is unavailable right now.'},{status:500});
  }
}