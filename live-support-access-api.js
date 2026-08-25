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

function isLiveSupport(session){
  return String(session?.role_name||'').trim().toLowerCase()==='live support specialist';
}

async function audit(env,session,eventType,ticketId,details={}){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at)
    VALUES (?, 'Member Communication', ?, ?, 'ticket', ?, ?, ?, ?, ?)
  `).bind(uuid('AUD'),eventType,session.user_id,ticketId,ticketId,JSON.stringify(details),now,now).run();
}

async function listQueue(env,session){
  const rows=await env.DB.prepare(`
    SELECT t.*,
      creator.display_name AS created_by_name,creator.email AS created_by_email,
      assignee.display_name AS assigned_to_name,assignee.email AS assigned_to_email
    FROM tickets t
    LEFT JOIN users creator ON creator.id=t.created_by_user_id
    LEFT JOIN users assignee ON assignee.id=t.assigned_to_user_id
    WHERE t.department='Operations' AND t.category='Member Communication'
    ORDER BY CASE t.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 ELSE 2 END,t.updated_at DESC
    LIMIT 200
  `).all();
  const tickets=(rows.results||[]).map(row=>({
    id:row.id,department:row.department,category:row.category,title:row.title,
    details:row.description||'',priority:row.priority,status:row.status,
    progress:Number(row.progress)||0,created:row.created_at,updated:row.updated_at,
    createdBy:row.created_by_name||row.created_by_email||'Aria Lifeline',
    assignedTo:row.assigned_to_name||row.assigned_to_email||null,notes:[]
  }));
  if(!tickets.length)return json({ok:true,tickets,viewer:{role:'Live Support Specialist',queue:'Member Communication'}});
  const ids=tickets.map(t=>t.id);
  const placeholders=ids.map(()=>'?').join(',');
  const notes=await env.DB.prepare(`
    SELECT n.id,n.ticket_id,n.note,n.created_at,u.display_name AS author_name,u.email AS author_email
    FROM ticket_notes n JOIN users u ON u.id=n.author_user_id
    WHERE n.ticket_id IN (${placeholders}) ORDER BY n.created_at ASC
  `).bind(...ids).all();
  const byId=new Map(tickets.map(t=>[t.id,t]));
  for(const note of notes.results||[]){
    byId.get(note.ticket_id)?.notes.push({id:note.id,author:note.author_name||note.author_email||'Staff',text:note.note,created:note.created_at});
  }
  return json({ok:true,tickets,viewer:{role:'Live Support Specialist',queue:'Member Communication'}});
}

async function memberCommunicationTicket(env,id){
  return env.DB.prepare(`
    SELECT * FROM tickets
    WHERE id=? AND department='Operations' AND category='Member Communication'
    LIMIT 1
  `).bind(id).first();
}

async function updateTicket(request,env,session,id){
  const ticket=await memberCommunicationTicket(env,id);
  if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
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
  await env.DB.prepare(`UPDATE tickets SET status=?,progress=?,assigned_to_user_id=COALESCE(assigned_to_user_id,?),updated_at=? WHERE id=?`)
    .bind(status,progress,session.user_id,now,id).run();
  try{await audit(env,session,'live_support_member_communication_updated',id,{status,progress});}catch(error){console.error('Live support audit failed',error);}
  return json({ok:true,status,progress,updatedAt:now});
}

async function addNote(request,env,session,id){
  const ticket=await memberCommunicationTicket(env,id);
  if(!ticket)return json({ok:false,error:'Member Communication item not found.'},{status:404});
  const body=await readBody(request);
  const note=String(body?.note||'').trim();
  if(!note||note.length>600)return json({ok:false,error:'Note is required and must be 600 characters or fewer.'},{status:400});
  const noteId=uuid('NOTE');
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ticket_notes (id,ticket_id,author_user_id,note,created_at) VALUES (?,?,?,?,?)`).bind(noteId,id,session.user_id,note,now),
    env.DB.prepare(`UPDATE tickets SET assigned_to_user_id=COALESCE(assigned_to_user_id,?),updated_at=? WHERE id=?`).bind(session.user_id,now,id)
  ]);
  try{await audit(env,session,'live_support_member_communication_note_added',id,{noteId});}catch(error){console.error('Live support audit failed',error);}
  return json({ok:true,note:{id:noteId,author:session.display_name||session.email||'Live Support',text:note,created:now}},{status:201});
}

export async function handleLiveSupportAccessRoute(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/staff/tickets'))return null;
  const session=await currentStaff(request,env);
  if(!session||session.account_type!=='staff'||session.status!=='active'||!isLiveSupport(session))return null;
  if(String(session.department||'').trim().toLowerCase()!=='operations')return json({ok:false,error:'Live Support Specialist must be assigned to Operations.'},{status:403});

  if(url.pathname==='/api/staff/tickets'&&request.method==='GET')return listQueue(env,session);
  if(url.pathname==='/api/staff/tickets'&&request.method==='POST')return json({ok:false,error:'Live Support Specialists cannot create general Operations tickets.'},{status:403});

  const noteMatch=url.pathname.match(/^\/api\/staff\/tickets\/([^/]+)\/notes$/);
  if(noteMatch&&request.method==='POST')return addNote(request,env,session,decodeURIComponent(noteMatch[1]));
  const ticketMatch=url.pathname.match(/^\/api\/staff\/tickets\/([^/]+)$/);
  if(ticketMatch&&request.method==='PATCH')return updateTicket(request,env,session,decodeURIComponent(ticketMatch[1]));
  return json({ok:false,error:'This Live Support role can only access Member Communication workflow actions.'},{status:403});
}
