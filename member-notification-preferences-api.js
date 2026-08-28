function json(data,init={}){
  return new Response(JSON.stringify(data),{
    ...init,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff',...(init.headers||{})}
  });
}
function bytesToHex(bytes){return [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value){return bytesToHex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value))));}
function parseCookies(request){
  const raw=request.headers.get('cookie')||'';
  return Object.fromEntries(raw.split(';').map(v=>v.trim()).filter(Boolean).map(v=>{const i=v.indexOf('=');return [v.slice(0,i),decodeURIComponent(v.slice(i+1))];}));
}
async function currentMember(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`SELECT u.id AS user_id,u.email FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.account_type='member' AND u.status='active' LIMIT 1`)
    .bind(tokenHash,new Date().toISOString()).first();
}
function normalizePhone(value){
  const raw=String(value??'').trim();
  if(!raw)return null;
  const digits=raw.replace(/\D/g,'');
  if(digits.length===10)return `+1${digits}`;
  if(digits.length===11&&digits.startsWith('1'))return `+${digits}`;
  if(raw.startsWith('+')&&digits.length>=8&&digits.length<=15)return `+${digits}`;
  return null;
}
async function ensureRow(env,member){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT OR IGNORE INTO member_notification_preferences
      (member_user_id,email_enabled,sms_enabled,private_content,created_at,updated_at)
    VALUES (?,1,1,1,?,?)
  `).bind(member.user_id,now,now).run();
  return env.DB.prepare(`
    SELECT p.email_enabled,p.sms_enabled,p.sms_phone_e164,p.private_content,u.email
    FROM member_notification_preferences p
    JOIN users u ON u.id=p.member_user_id
    WHERE p.member_user_id=? LIMIT 1
  `).bind(member.user_id).first();
}
async function audit(env,member,details){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at) VALUES (?, 'Privacy', 'member_notification_preferences_updated', ?, 'member', ?, ?, ?, ?)`)
    .bind(`AUD-${crypto.randomUUID()}`,member.user_id,member.user_id,JSON.stringify(details),now,now).run();
}

export async function handleMemberNotificationPreferencesRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname!=='/api/member/notification-preferences')return null;
  const member=await currentMember(request,env);
  if(!member)return json({ok:false,error:'Sign in as a member to manage notifications.'},{status:401});

  if(request.method==='GET'){
    const row=await ensureRow(env,member);
    return json({
      ok:true,
      emailEnabled:Number(row.email_enabled)===1,
      smsEnabled:Number(row.sms_enabled)===1,
      email:row.email||'',
      mobileNumber:row.sms_phone_e164||'',
      privateContent:Number(row.private_content)===1
    });
  }

  if(request.method==='PATCH'){
    let body={};try{body=await request.json();}catch{}
    const emailEnabled=body.emailEnabled===undefined?null:Boolean(body.emailEnabled);
    const smsEnabled=body.smsEnabled===undefined?null:Boolean(body.smsEnabled);
    const privateContent=body.privateContent===undefined?null:Boolean(body.privateContent);
    let phoneMarker='unchanged';
    let phone=null;
    if(body.mobileNumber!==undefined){
      const raw=String(body.mobileNumber??'').trim();
      if(raw){
        phone=normalizePhone(raw);
        if(!phone)return json({ok:false,error:'Enter a valid mobile number, such as (555) 123-4567.'},{status:400});
        phoneMarker='updated';
      }else{
        phoneMarker='cleared';
      }
    }
    await ensureRow(env,member);
    const now=new Date().toISOString();
    await env.DB.prepare(`
      UPDATE member_notification_preferences
      SET email_enabled=COALESCE(?,email_enabled),
          sms_enabled=COALESCE(?,sms_enabled),
          sms_phone_e164=CASE WHEN ?='unchanged' THEN sms_phone_e164 ELSE ? END,
          private_content=COALESCE(?,private_content),
          updated_at=?
      WHERE member_user_id=?
    `).bind(
      emailEnabled===null?null:(emailEnabled?1:0),
      smsEnabled===null?null:(smsEnabled?1:0),
      phoneMarker,phone,
      privateContent===null?null:(privateContent?1:0),
      now,member.user_id
    ).run();
    try{await audit(env,member,{emailEnabled,smsEnabled,mobileNumber:phoneMarker,privateContent});}catch(error){console.error('Notification preference audit failed',error);}
    const row=await ensureRow(env,member);
    return json({
      ok:true,
      emailEnabled:Number(row.email_enabled)===1,
      smsEnabled:Number(row.sms_enabled)===1,
      email:row.email||'',
      mobileNumber:row.sms_phone_e164||'',
      privateContent:Number(row.private_content)===1
    });
  }

  return json({ok:false,error:'Method not allowed.'},{status:405});
}
