const RECOVERY_FROM='verify@ariaishere.com';
const jsonHeaders={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'};

function json(data,init={}){return new Response(JSON.stringify(data),{...init,headers:{...jsonHeaders,...(init.headers||{})}});}
function normalizeEmail(value=''){return String(value).trim().toLowerCase();}
function uuid(prefix){return `${prefix}-${crypto.randomUUID()}`;}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function databaseReady(env){return Boolean(env.DB&&typeof env.DB.prepare==='function');}
async function readBody(request){try{return await request.json();}catch{return null;}}
function makeCode(){const bytes=crypto.getRandomValues(new Uint8Array(4));const value=((bytes[0]<<24)|(bytes[1]<<16)|(bytes[2]<<8)|bytes[3])>>>0;return String(value%1000000).padStart(6,'0');}

async function hashPassword(password){
  const salt=crypto.getRandomValues(new Uint8Array(16));
  const iterations=100000;
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);
  return `pbkdf2-sha256$${iterations}$${bytesToHex(salt)}$${bytesToHex(bits)}`;
}

async function audit(env,event){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO audit_events
    (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at)
    VALUES (?,?,?,?,?,?,?,?,?)`)
    .bind(uuid('AUD'),'Authentication',event.type,event.userId||null,'user',event.userId||null,JSON.stringify(event.details||{}),now,now).run();
}

async function requestIpHash(request){
  const ip=request.headers.get('cf-connecting-ip')||'';
  return ip?sha256(`aria-password-recovery-v1:${ip}`):null;
}

async function sendRecoveryEmail(env,email,code){
  if(!env.EMAIL||typeof env.EMAIL.send!=='function')throw new Error('email_binding_unavailable');
  return env.EMAIL.send({
    to:email,
    from:RECOVERY_FROM,
    subject:'Your Aria password reset code',
    text:`Your Aria password reset code is ${code}. This code expires in 15 minutes. If you did not request a password reset, you can ignore this email.`,
    html:`<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;color:#142033"><div style="font-size:12px;letter-spacing:.12em;font-weight:700;color:#6269e5">ARIA AI</div><h1 style="font-size:26px;margin:8px 0 12px">Reset your password</h1><p>Use this 6-digit code to reset your Aria password:</p><div style="font-size:34px;font-weight:800;letter-spacing:.18em;margin:24px 0;color:#4f56c8">${code}</div><p style="color:#6d788a">This code expires in 15 minutes.</p><p style="color:#6d788a;font-size:13px">If you did not request a password reset, you can ignore this email.</p></div>`
  });
}

async function handleRequest(request,env){
  if(!databaseReady(env))return json({ok:false,error:'The Aria database is not connected.'},{status:503});
  const body=await readBody(request);
  const email=normalizeEmail(body?.email);
  const generic={ok:true,message:'If an Aria account exists for that email, a 6-digit reset code will be sent.'};
  if(!email||!email.includes('@'))return json(generic);

  const user=await env.DB.prepare(`SELECT id,email,status,password_hash FROM users WHERE email=? LIMIT 1`).bind(email).first();
  if(!user||user.status!=='active'||!user.password_hash)return json(generic);

  const recent=await env.DB.prepare(`SELECT created_at FROM password_reset_codes WHERE user_id=? ORDER BY created_at DESC LIMIT 1`).bind(user.id).first();
  if(recent&&Date.now()-new Date(recent.created_at).getTime()<60000)return json(generic);

  const now=new Date().toISOString();
  const code=makeCode();
  const codeHash=await sha256(code);
  const expiresAt=new Date(Date.now()+15*60*1000).toISOString();
  const resetId=uuid('PWR');
  const ipHash=await requestIpHash(request);
  const userAgent=request.headers.get('user-agent')||null;

  await env.DB.batch([
    env.DB.prepare(`UPDATE password_reset_codes SET used_at=? WHERE user_id=? AND used_at IS NULL`).bind(now,user.id),
    env.DB.prepare(`INSERT INTO password_reset_codes
      (id,user_id,code_hash,created_at,expires_at,verified_at,used_at,attempt_count,request_ip_hash,user_agent)
      VALUES (?,?,?,?,?,NULL,NULL,0,?,?)`).bind(resetId,user.id,codeHash,now,expiresAt,ipHash,userAgent)
  ]);

  try{
    await sendRecoveryEmail(env,email,code);
    await audit(env,{type:'password_recovery_email_sent',userId:user.id,details:{resetId,expiresAt}});
  }catch(error){
    await audit(env,{type:'password_recovery_email_failed',userId:user.id,details:{resetId,reason:error?.message||'provider_error'}});
  }

  return json(generic);
}

async function getActiveReset(env,email,code){
  const user=await env.DB.prepare(`SELECT id,email,status FROM users WHERE email=? LIMIT 1`).bind(email).first();
  if(!user||user.status!=='active')return {user:null,reset:null};
  const reset=await env.DB.prepare(`SELECT * FROM password_reset_codes WHERE user_id=? AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`).bind(user.id).first();
  if(!reset)return {user,reset:null};
  if(new Date(reset.expires_at).getTime()<=Date.now())return {user,reset:null};
  const codeHash=await sha256(code);
  return {user,reset,codeMatches:codeHash===reset.code_hash};
}

async function handleVerify(request,env){
  if(!databaseReady(env))return json({ok:false,error:'The Aria database is not connected.'},{status:503});
  const body=await readBody(request);
  const email=normalizeEmail(body?.email);
  const code=String(body?.code||'').trim();
  if(!email||!/^\d{6}$/.test(code))return json({ok:false,error:'That reset code is invalid or expired.'},{status:400});

  const {user,reset,codeMatches}=await getActiveReset(env,email,code);
  if(!user||!reset)return json({ok:false,error:'That reset code is invalid or expired.'},{status:400});
  if(Number(reset.attempt_count||0)>=6)return json({ok:false,error:'That reset code is invalid or expired.'},{status:400});
  if(!codeMatches){
    await env.DB.prepare(`UPDATE password_reset_codes SET attempt_count=attempt_count+1 WHERE id=?`).bind(reset.id).run();
    return json({ok:false,error:'That reset code is invalid or expired.'},{status:400});
  }

  const verifiedAt=new Date().toISOString();
  await env.DB.prepare(`UPDATE password_reset_codes SET verified_at=? WHERE id=?`).bind(verifiedAt,reset.id).run();
  await audit(env,{type:'password_recovery_code_verified',userId:user.id,details:{resetId:reset.id}});
  return json({ok:true,verified:true});
}

async function handleComplete(request,env){
  if(!databaseReady(env))return json({ok:false,error:'The Aria database is not connected.'},{status:503});
  const body=await readBody(request);
  const email=normalizeEmail(body?.email);
  const code=String(body?.code||'').trim();
  const password=String(body?.password||'');
  if(password.length<14||password.length>200)return json({ok:false,error:'Use a password between 14 and 200 characters.'},{status:400});
  if(!email||!/^\d{6}$/.test(code))return json({ok:false,error:'That reset session is invalid or expired.'},{status:400});

  const {user,reset,codeMatches}=await getActiveReset(env,email,code);
  if(!user||!reset||!codeMatches||!reset.verified_at||Number(reset.attempt_count||0)>=6){
    return json({ok:false,error:'That reset session is invalid or expired.'},{status:400});
  }

  const now=new Date().toISOString();
  const passwordHash=await hashPassword(password);
  await env.DB.batch([
    env.DB.prepare(`UPDATE users SET password_hash=?,updated_at=? WHERE id=?`).bind(passwordHash,now,user.id),
    env.DB.prepare(`UPDATE password_reset_codes SET used_at=? WHERE id=?`).bind(now,reset.id),
    env.DB.prepare(`UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL`).bind(now,user.id)
  ]);
  await audit(env,{type:'password_reset_completed',userId:user.id,details:{resetId:reset.id,sessionsRevoked:true}});
  return json({ok:true,message:'Your password has been updated. Sign in with your new password.'});
}

export async function handlePasswordRecoveryRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/password-recovery/request'&&request.method==='POST')return handleRequest(request,env);
  if(url.pathname==='/api/password-recovery/verify'&&request.method==='POST')return handleVerify(request,env);
  if(url.pathname==='/api/password-recovery/complete'&&request.method==='POST')return handleComplete(request,env);
  return null;
}
