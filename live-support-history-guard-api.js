function json(data,init={}){
  return new Response(JSON.stringify(data),{...init,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}});
}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){const raw=request.headers.get('cookie')||'';return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));}
function normalized(value){return String(value||'').trim().toLowerCase();}
function uuid(prefix){return `${prefix}-${crypto.randomUUID()}`;}

async function currentStaff(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.account_type,u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS role_name,
      (SELECT department FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS department
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
    LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}

function canOperateLiveSupport(session){
  const role=normalized(session?.role_name);
  if(['founder','founder / co-founder','co-founder','system administrator','system admin'].includes(role))return true;
  return normalized(session?.department)==='operations';
}

async function closeLiveSupportTicket(request,env,ticketId,session,ticket){
  if(!canOperateLiveSupport(session))return json({ok:false,error:'You do not have access to this ticket.'},{status:403});
  let body={};
  try{body=await request.clone().json();}catch{}
  const wantsClosed=String(body?.status||'').toLowerCase()==='closed'||Number(body?.progress)===100;
  if(!wantsClosed)return null;

  const now=new Date().toISOString();
  const incident=await env.DB.prepare(`
    SELECT id,member_user_id,current_risk_level,status
    FROM lifeline_incidents
    WHERE related_ticket_id=? AND status!='closed'
    ORDER BY updated_at DESC LIMIT 1
  `).bind(ticketId).first();

  const statements=[
    env.DB.prepare(`UPDATE tickets SET status='Closed',progress=100,updated_at=? WHERE id=?`).bind(now,ticketId)
  ];

  if(incident){
    statements.push(
      env.DB.prepare(`UPDATE lifeline_incidents SET status='closed',closed_at=COALESCE(closed_at,?),updated_at=? WHERE id=?`).bind(now,now,incident.id),
      env.DB.prepare(`
        INSERT INTO lifeline_events
        (id,incident_id,member_user_id,event_type,risk_level,actor_type,actor_user_id,details_json,occurred_at,recorded_at)
        VALUES (?,?,?,?,?,'staff',?,?,?,?)
      `).bind(uuid('LFLE'),incident.id,incident.member_user_id,'support_closed',incident.current_risk_level||null,session.user_id,JSON.stringify({ticketId}),now,now)
    );
  }

  statements.push(
    env.DB.prepare(`
      INSERT INTO audit_events
      (id,category,event_type,actor_user_id,subject_type,subject_id,related_ticket_id,details_json,occurred_at,recorded_at)
      VALUES (?,'Staff Operations','staff_ticket_updated',?,'ticket',?,?,?, ?,?)
    `).bind(uuid('AUD'),session.user_id,ticketId,ticketId,JSON.stringify({fromStatus:ticket.status,toStatus:'Closed',fromProgress:ticket.progress,toProgress:100,liveSupportIncidentClosed:Boolean(incident)}),now,now)
  );

  await env.DB.batch(statements);
  return json({ok:true,status:'Closed',progress:100,updatedAt:now,incidentClosed:Boolean(incident)});
}

export async function handleLiveSupportHistoryGuardRoute(request,env){
  const url=new URL(request.url);

  if(url.pathname==='/api/staff/live-support/records'&&request.method==='GET'){
    const session=await currentStaff(request,env);
    if(!session||session.account_type!=='staff'||session.status!=='active')return json({ok:false,error:'Authentication required.'},{status:401});
    if(!['founder','lead supervisor'].includes(normalized(session.role_name))){
      return json({ok:false,error:'Closed Live Support history is restricted to Founder and Lead Supervisor.'},{status:403});
    }
    return null;
  }

  const ticketMatch=url.pathname.match(/^\/api\/staff\/tickets\/([^/]+)$/);
  if(ticketMatch&&request.method==='PATCH'){
    const ticketId=decodeURIComponent(ticketMatch[1]);
    const ticket=await env.DB.prepare(`SELECT id,department,category,status,progress FROM tickets WHERE id=? LIMIT 1`).bind(ticketId).first();
    if(!ticket||ticket.department!=='Operations'||ticket.category!=='Member Communication')return null;
    const session=await currentStaff(request,env);
    if(!session||session.account_type!=='staff'||session.status!=='active')return json({ok:false,error:'Authentication required.'},{status:401});
    return closeLiveSupportTicket(request,env,ticketId,session,ticket);
  }

  return null;
}
