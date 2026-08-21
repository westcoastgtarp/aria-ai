const jsonHeaders={
  'content-type':'application/json; charset=utf-8',
  'cache-control':'no-store',
  'x-content-type-options':'nosniff'
};

function json(data,init={}){
  return new Response(JSON.stringify(data),{...init,headers:{...jsonHeaders,...(init.headers||{})}});
}

function uuid(prefix){return `${prefix}-${crypto.randomUUID()}`;}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){
  const raw=request.headers.get('cookie')||'';
  return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{
    const index=v.indexOf('=');
    return [v.slice(0,index),decodeURIComponent(v.slice(index+1))];
  }));
}
async function readBody(request){try{return await request.json();}catch{return null;}}
function databaseReady(env){return Boolean(env.DB&&typeof env.DB.prepare==='function');}

async function currentStaffSession(request,env){
  if(!databaseReady(env))return null;
  const token=parseCookies(request).aria_session;
  if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.account_type,u.status,
      (SELECT role_name FROM staff_roles r WHERE r.user_id=u.id AND r.active=1 ORDER BY r.assigned_at DESC LIMIT 1) AS staff_role
    FROM sessions s
    JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
    LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}

async function requireRole(request,env,allowed){
  const session=await currentStaffSession(request,env);
  if(!session||session.account_type!=='staff'||session.status!=='active'){
    return {error:json({ok:false,error:'Authentication required.'},{status:401})};
  }
  const role=String(session.staff_role||'').toLowerCase();
  if(!allowed.map(v=>v.toLowerCase()).includes(role)){
    return {error:json({ok:false,error:'You do not have permission to perform this action.'},{status:403})};
  }
  return {session};
}

async function audit(env,event){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at)
    VALUES (?,?,?,?,?,?,?,?,?)
  `).bind(uuid('AUD'),'Account Access',event.type,event.actorUserId,'member_invitation',event.invitationId,JSON.stringify(event.details||{}),now,now).run();
}

async function handleRevoke(request,env){
  const auth=await requireRole(request,env,['Founder / Co-Founder','Founder','Co-Founder','System Administrator','System Admin']);
  if(auth.error)return auth.error;
  const body=await readBody(request);
  const invitationId=String(body?.invitationId||'').trim();
  if(!invitationId)return json({ok:false,error:'Invitation ID is required.'},{status:400});

  const invitation=await env.DB.prepare(`SELECT id,email,status FROM member_invitations WHERE id=? LIMIT 1`).bind(invitationId).first();
  if(!invitation)return json({ok:false,error:'Invitation not found.'},{status:404});
  if(invitation.status==='used')return json({ok:false,error:'Used invitations cannot be revoked because they are part of the member account history.'},{status:409});
  if(invitation.status==='revoked')return json({ok:true,invitation:{id:invitation.id,status:'revoked'}});

  await env.DB.prepare(`UPDATE member_invitations SET status='revoked' WHERE id=?`).bind(invitationId).run();
  await audit(env,{type:'member_invitation_revoked',actorUserId:auth.session.user_id,invitationId,details:{email:invitation.email,previousStatus:invitation.status}});
  return json({ok:true,invitation:{id:invitation.id,status:'revoked'}});
}

async function handleDelete(request,env){
  const auth=await requireRole(request,env,['Founder / Co-Founder','Founder','Co-Founder']);
  if(auth.error)return auth.error;
  const body=await readBody(request);
  const invitationId=String(body?.invitationId||'').trim();
  if(!invitationId)return json({ok:false,error:'Invitation ID is required.'},{status:400});

  const invitation=await env.DB.prepare(`SELECT id,email,status FROM member_invitations WHERE id=? LIMIT 1`).bind(invitationId).first();
  if(!invitation)return json({ok:false,error:'Invitation not found.'},{status:404});
  if(invitation.status==='used')return json({ok:false,error:'This invitation was used and must remain in the audit history.'},{status:409});

  const consentCount=await env.DB.prepare(`SELECT COUNT(*) AS count FROM member_consents WHERE invitation_id=?`).bind(invitationId).first();
  if(Number(consentCount?.count||0)>0){
    return json({ok:false,error:'This invitation has member consent history and cannot be permanently deleted.'},{status:409});
  }

  const accountCount=await env.DB.prepare(`SELECT COUNT(*) AS count FROM users WHERE email=? AND account_type='member'`).bind(invitation.email).first();
  if(Number(accountCount?.count||0)>0){
    return json({ok:false,error:'A member account history exists for this email. Revoke the invitation instead.'},{status:409});
  }

  await env.DB.prepare(`DELETE FROM member_invitations WHERE id=?`).bind(invitationId).run();
  await audit(env,{type:'member_invitation_deleted',actorUserId:auth.session.user_id,invitationId,details:{email:invitation.email,previousStatus:invitation.status,permanent:true}});
  return json({ok:true,deleted:true,invitationId});
}

export async function handleInvitationManagementRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/invitations/revoke'&&request.method==='POST')return handleRevoke(request,env);
  if(url.pathname==='/api/invitations/delete'&&request.method==='POST')return handleDelete(request,env);
  return null;
}
