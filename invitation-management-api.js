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

async function handleList(request,env){
  const auth=await requireRole(request,env,['Founder / Co-Founder','Founder','Co-Founder','System Administrator','System Admin']);
  if(auth.error)return auth.error;

  const url=new URL(request.url);
  const includeArchived=url.searchParams.get('includeArchived')==='1';
  const now=new Date().toISOString();

  const statement=includeArchived
    ? env.DB.prepare(`
        SELECT i.id,i.email,i.status,i.issued_at,i.expires_at,i.used_at,
               COALESCE(u.display_name,u.email,'Authorized administrator') AS issued_by
        FROM member_invitations i
        LEFT JOIN users u ON u.id=i.issued_by_user_id
        ORDER BY i.issued_at DESC
        LIMIT 100
      `)
    : env.DB.prepare(`
        SELECT i.id,i.email,i.status,i.issued_at,i.expires_at,i.used_at,
               COALESCE(u.display_name,u.email,'Authorized administrator') AS issued_by
        FROM member_invitations i
        LEFT JOIN users u ON u.id=i.issued_by_user_id
        WHERE i.status='pending' AND (i.expires_at IS NULL OR i.expires_at>?)
        ORDER BY i.issued_at DESC
        LIMIT 100
      `).bind(now);

  const result=await statement.all();
  const invitations=(result.results||[]).map(item=>({
    id:item.id,
    email:item.email,
    status:item.status==='pending'&&item.expires_at&&item.expires_at<=now?'expired':item.status,
    issuedAt:item.issued_at,
    expiresAt:item.expires_at,
    usedAt:item.used_at,
    issuedBy:item.issued_by
  }));

  return json({ok:true,invitations,includeArchived});
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
  if(invitation.status==='used')return json({ok:false,error:'This invitation was used to create a member account and must remain in history.'},{status:409});

  const member=await env.DB.prepare(`
    SELECT id,status,email_verified_at,password_hash
    FROM users
    WHERE email=? AND account_type='member'
    LIMIT 1
  `).bind(invitation.email).first();

  if(member?.status==='active'){
    return json({ok:false,error:'An active member account exists for this invitation. It cannot be permanently deleted.'},{status:409});
  }

  let removedPendingSignup=false;
  let removedConsentRecords=0;

  if(member){
    const planCount=await env.DB.prepare(`SELECT COUNT(*) AS count FROM member_plan_selections WHERE user_id=?`).bind(member.id).first();
    if(Number(planCount?.count||0)>0){
      return json({ok:false,error:'This member has plan/account history. Keep the invitation in the audit history.'},{status:409});
    }

    const consentForInvite=await env.DB.prepare(`SELECT COUNT(*) AS count FROM member_consents WHERE user_id=? AND invitation_id=?`).bind(member.id,invitationId).first();
    const allConsent=await env.DB.prepare(`SELECT COUNT(*) AS count FROM member_consents WHERE user_id=?`).bind(member.id).first();
    const inviteConsentCount=Number(consentForInvite?.count||0);
    const allConsentCount=Number(allConsent?.count||0);
    removedConsentRecords=inviteConsentCount;

    if(allConsentCount===inviteConsentCount){
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM email_verifications WHERE user_id=?`).bind(member.id),
        env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(member.id),
        env.DB.prepare(`DELETE FROM member_consents WHERE invitation_id=?`).bind(invitationId),
        env.DB.prepare(`DELETE FROM users WHERE id=? AND account_type='member' AND status='pending'`).bind(member.id),
        env.DB.prepare(`DELETE FROM member_invitations WHERE id=?`).bind(invitationId)
      ]);
      removedPendingSignup=true;
    }else{
      await env.DB.batch([
        env.DB.prepare(`DELETE FROM member_consents WHERE invitation_id=?`).bind(invitationId),
        env.DB.prepare(`DELETE FROM member_invitations WHERE id=?`).bind(invitationId)
      ]);
    }
  }else{
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM member_consents WHERE invitation_id=?`).bind(invitationId),
      env.DB.prepare(`DELETE FROM member_invitations WHERE id=?`).bind(invitationId)
    ]);
  }

  await audit(env,{
    type:'member_invitation_deleted',
    actorUserId:auth.session.user_id,
    invitationId,
    details:{
      email:invitation.email,
      previousStatus:invitation.status,
      permanent:true,
      removedPendingSignup,
      removedConsentRecords
    }
  });

  return json({ok:true,deleted:true,invitationId,removedPendingSignup,removedConsentRecords});
}

export async function handleInvitationManagementRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/invitations/list'&&request.method==='GET')return handleList(request,env);
  if(url.pathname==='/api/invitations/revoke'&&request.method==='POST')return handleRevoke(request,env);
  if(url.pathname==='/api/invitations/delete'&&request.method==='POST')return handleDelete(request,env);
  return null;
}
