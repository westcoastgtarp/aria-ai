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

function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){
  const raw=request.headers.get('cookie')||'';
  return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const i=v.indexOf('=');
    return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];
  }));
}
async function readBody(request){try{return await request.json();}catch{return null;}}
function uuid(prefix){return `${prefix}-${crypto.randomUUID()}`;}
function normalized(value){return String(value||'').trim().toLowerCase();}

async function currentStaff(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;
  if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.email,u.display_name,u.account_type,u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS role_name,
      (SELECT department FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS department
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
    LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}

function isLiveSupportSpecialist(session){
  return normalized(session?.role_name)==='live support specialist';
}

function canReviewLiveSupportRecords(session){
  const role=normalized(session?.role_name);
  return role==='founder'||role==='supervisor of live support'||role==='hr'||role==='human resources';
}

async function audit(env,session,eventType,ticketId,details={}){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at)
    VALUES (?, 'Member Communication', ?, ?, 'ticket', ?, ?, ?, ?, ?)
  `).bind(uuid('AUD'),eventType,session.user_id,ticketId,ticketId,JSON.stringify(details),now,now).run();
}

function ticketShape(row){
  return {
    id:row.id,
    department:row.department,
    category:row.category,
    title:row.title,
    details:row.description||'',
    priority:row.priority,
    status:row.status,
    progress:Number(row.progress)||0,
    created:row.created_at,
    updated:row.updated_at,
    memberUserId:row.created_by_user_id||null,
    createdBy:row.created_by_name||row.created_by_email||'Aria Lifeline',
    assignedToUserId:row.assigned_to_user_id||null,
    assignedTo:row.assigned_to_name||row.assigned_to_email||null,
    notes:[]
  };
}

async function attachNotes(env,tickets){
  if(!tickets.length)return tickets;
  const ids=tickets.map(t=>t.id);
  const placeholders=ids.map(()=>'?').join(',');
  const notes=await env.DB.prepare(`
    SELECT n.id,n.ticket_id,n.note,n.created_at,u.display_name AS author_name,u.email AS author_email
    FROM ticket_notes n
    JOIN users u ON u.id=n.author_user_id
    WHERE n.ticket_id IN (${placeholders})
    ORDER BY n.created_at ASC
  `).bind(...ids).all();
  const byId=new Map(tickets.map(t=>[t.id,t]));
  for(const note of notes.results||[]){
    byId.get(note.ticket_id)?.notes.push({
      id:note.id,
      author:note.author_name||note.author_email||'Staff',
      text:note.note,
      created:note.created_at
    });
  }
  return tickets;
}

async function listSpecialistQueue(env,session){
  const rows=await env.DB.prepare(`
    SELECT t.*,
      creator.display_name AS created_by_name,creator.email AS created_by_email,
      assignee.display_name AS assigned_to_name,assignee.email AS assigned_to_email
    FROM tickets t
    LEFT JOIN users creator ON creator.id=t.created_by_user_id
    LEFT JOIN users assignee ON assignee.id=t.assigned_to_user_id
    WHERE t.department='Operations'
      AND t.category='Member Communication'
      AND t.status!='Closed'
      AND (t.assigned_to_user_id IS NULL OR t.assigned_to_user_id=?)
    ORDER BY CASE t.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 ELSE 2 END,t.updated_at DESC
    LIMIT 200
  `).bind(session.user_id).all();
  const tickets=await attachNotes(env,(rows.results||[]).map(ticketShape));
  return json({
    ok:true,
    tickets,
    viewer:{role:'Live Support Specialist',queue:'Member Communication',reviewAccess:false}
  });
}

async function listRestrictedRecords(env,session){
  const rows=await env.DB.prepare(`
    SELECT t.*,
      creator.display_name AS created_by_name,creator.email AS created_by_email,
      assignee.display_name AS assigned_to_name,assignee.email AS assigned_to_email
    FROM tickets t
    LEFT JOIN users creator ON creator.id=t.created_by_user_id
    LEFT JOIN users assignee ON assignee.id=t.assigned_to_user_id
    WHERE t.department='Operations' AND t.category='Member Communication'
    ORDER BY t.updated_at DESC
    LIMIT 500
  `).all();
  const tickets=await attachNotes(env,(rows.results||[]).map(ticketShape));
  try{await audit(env,session,'live_support_records_reviewed','RECORDS',{count:tickets.length,role:session.role_name});}catch(error){console.error('Live support review audit failed',error);}
  return json({
    ok:true,
    records:tickets,
    viewer:{role:session.role_name,reviewAccess:true,readOnly:true}
  });
}

async function memberCommunicationTicket(env,id){
  return env.DB.prepare(`
    SELECT * FROM tickets
    WHERE id=? AND department='Operations' AND category='Member Communication'
    LIMIT 1
  `).bind(id).first();
}

async function claimTicket(env,session,id){
  const ticket=await memberCommunicationTicket(env,id);
  if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  if(ticket.status==='Closed')return json({ok:false,error:'Closed Live Support records cannot be claimed.'},{status:409});
  if(ticket.assigned_to_user_id===session.user_id){
    return json({ok:true,claimed:true,ticketId:id,alreadyOwned:true});
  }
  if(ticket.assigned_to_user_id){
    return json({ok:false,error:'This Live Support conversation is already assigned to another specialist.'},{status:409});
  }

  const now=new Date().toISOString();
  const result=await env.DB.prepare(`
    UPDATE tickets
    SET assigned_to_user_id=?,status='In Progress',progress=CASE WHEN progress=0 THEN 25 ELSE progress END,updated_at=?
    WHERE id=?
      AND department='Operations'
      AND category='Member Communication'
      AND assigned_to_user_id IS NULL
      AND status!='Closed'
  `).bind(session.user_id,now,id).run();

  if(Number(result?.meta?.changes||0)!==1){
    return json({ok:false,error:'This Live Support conversation was claimed by another specialist.'},{status:409});
  }
  try{await audit(env,session,'live_support_conversation_claimed',id,{assignedToUserId:session.user_id});}catch(error){console.error('Live support claim audit failed',error);}
  return json({ok:true,claimed:true,ticketId:id,assignedToUserId:session.user_id,updatedAt:now});
}

function ensureAssignedToSpecialist(ticket,session){
  if(!ticket.assigned_to_user_id){
    return json({ok:false,error:'Claim this Live Support conversation before working it.'},{status:409});
  }
  if(ticket.assigned_to_user_id!==session.user_id){
    return json({ok:false,error:'You may only work Live Support conversations assigned to you.'},{status:403});
  }
  return null;
}

async function updateTicket(request,env,session,id){
  const ticket=await memberCommunicationTicket(env,id);
  if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  const assignmentError=ensureAssignedToSpecialist(ticket,session);
  if(assignmentError)return assignmentError;

  const body=await readBody(request);
  let progress=body?.progress==null?Number(ticket.progress):Number(body.progress);
  if(![0,25,50,75,100].includes(progress))return json({ok:false,error:'Progress must be 0, 25, 50, 75, or 100.'},{status:400});
  let status=String(body?.status||ticket.status);
  if(!['Open','In Progress','Closed'].includes(status))return json({ok:false,error:'Invalid status.'},{status:400});
  if(progress===100)status='Closed';
  else if(progress>0)status='In Progress';
  else if(status==='Closed')progress=100;
  if(status==='In Progress'&&progress===0)progress=25;

  const now=new Date().toISOString();
  await env.DB.prepare(`
    UPDATE tickets SET status=?,progress=?,updated_at=?
    WHERE id=? AND assigned_to_user_id=?
  `).bind(status,progress,now,id,session.user_id).run();
  try{await audit(env,session,'live_support_member_communication_updated',id,{status,progress});}catch(error){console.error('Live support audit failed',error);}
  return json({ok:true,status,progress,updatedAt:now});
}

async function addNote(request,env,session,id){
  const ticket=await memberCommunicationTicket(env,id);
  if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  const assignmentError=ensureAssignedToSpecialist(ticket,session);
  if(assignmentError)return assignmentError;

  const body=await readBody(request);
  const note=String(body?.note||'').trim();
  if(!note||note.length>600)return json({ok:false,error:'Note is required and must be 600 characters or fewer.'},{status:400});
  const noteId=uuid('NOTE');
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ticket_notes (id,ticket_id,author_user_id,note,created_at) VALUES (?,?,?,?,?)`).bind(noteId,id,session.user_id,note,now),
    env.DB.prepare(`UPDATE tickets SET updated_at=? WHERE id=? AND assigned_to_user_id=?`).bind(now,id,session.user_id)
  ]);
  try{await audit(env,session,'live_support_member_communication_note_added',id,{noteId});}catch(error){console.error('Live support audit failed',error);}
  return json({ok:true,note:{id:noteId,author:session.display_name||session.email||'Live Support',text:note,created:now}},{status:201});
}

export async function handleLiveSupportAccessRoute(request,env){
  const url=new URL(request.url);
  const isTicketRoute=url.pathname.startsWith('/api/staff/tickets');
  const isLiveSupportRoute=url.pathname.startsWith('/api/staff/live-support');
  if(!isTicketRoute&&!isLiveSupportRoute)return null;

  const session=await currentStaff(request,env);
  if(!session||session.account_type!=='staff'||session.status!=='active')return null;

  if(isLiveSupportRoute){
    if(url.pathname==='/api/staff/live-support/records'&&request.method==='GET'){
      if(!canReviewLiveSupportRecords(session)){
        return json({ok:false,error:'Live Support record review is restricted to Founder, Supervisor of Live Support, and HR.'},{status:403});
      }
      return listRestrictedRecords(env,session);
    }

    const claimMatch=url.pathname.match(/^\/api\/staff\/live-support\/tickets\/([^/]+)\/claim$/);
    if(claimMatch&&request.method==='POST'){
      if(!isLiveSupportSpecialist(session))return json({ok:false,error:'Only a Live Support Specialist can claim a Live Support conversation.'},{status:403});
      if(normalized(session.department)!=='operations')return json({ok:false,error:'Live Support Specialist must be assigned to Operations.'},{status:403});
      return claimTicket(env,session,decodeURIComponent(claimMatch[1]));
    }

    return json({ok:false,error:'Live Support action not permitted.'},{status:403});
  }

  if(!isLiveSupportSpecialist(session))return null;
  if(normalized(session.department)!=='operations')return json({ok:false,error:'Live Support Specialist must be assigned to Operations.'},{status:403});

  if(url.pathname==='/api/staff/tickets'&&request.method==='GET')return listSpecialistQueue(env,session);
  if(url.pathname==='/api/staff/tickets'&&request.method==='POST')return json({ok:false,error:'Live Support Specialists cannot create general Operations tickets.'},{status:403});

  const noteMatch=url.pathname.match(/^\/api\/staff\/tickets\/([^/]+)\/notes$/);
  if(noteMatch&&request.method==='POST')return addNote(request,env,session,decodeURIComponent(noteMatch[1]));
  const ticketMatch=url.pathname.match(/^\/api\/staff\/tickets\/([^/]+)$/);
  if(ticketMatch&&request.method==='PATCH')return updateTicket(request,env,session,decodeURIComponent(ticketMatch[1]));
  return json({ok:false,error:'This Live Support role can only access assigned Member Communication workflow actions.'},{status:403});
}
