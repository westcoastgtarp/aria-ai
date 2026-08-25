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

async function currentMember(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;
  if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.display_name,u.email
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

function trialActive(selectedAt){
  const start=new Date(selectedAt);
  if(Number.isNaN(start.getTime()))return false;
  return Date.now()<start.getTime()+(30*24*60*60*1000);
}

async function hasLifelineAccess(env,userId){
  const selection=await env.DB.prepare(`
    SELECT plan_code,status,selected_at
    FROM member_plan_selections
    WHERE user_id=?
    ORDER BY selected_at DESC
    LIMIT 1
  `).bind(userId).first();
  if(!selection)return false;
  const paidActive=String(selection.plan_code||'').startsWith('lifeline_')&&selection.status==='active';
  return paidActive||trialActive(selection.selected_at);
}

async function primaryApprovedContact(env,userId){
  return env.DB.prepare(`
    SELECT id,display_name,relationship,phone,priority
    FROM care_circle_contacts
    WHERE user_id=?
      AND status='active'
      AND consent_confirmed=1
    ORDER BY priority ASC,created_at ASC
    LIMIT 1
  `).bind(userId).first();
}

async function recordAudit(env,member,contact,details){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
    (id, category, event_type, actor_user_id, subject_type, subject_id, details_json, occurred_at, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    `AUD-${crypto.randomUUID()}`,
    'Lifeline Safety',
    details.eventType,
    member.user_id,
    'care_circle_contact',
    contact?.id||null,
    JSON.stringify(details.payload||{}),
    now,
    now
  ).run();
}

async function sendProviderAlert(env,payload){
  const url=String(env.LIFELINE_ALERT_WEBHOOK_URL||'').trim();
  if(!url)return {sent:false,reason:'provider_not_configured'};
  const token=String(env.LIFELINE_ALERT_WEBHOOK_TOKEN||'').trim();
  const response=await fetch(url,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      ...(token?{authorization:`Bearer ${token}`}:{})
    },
    body:JSON.stringify(payload)
  });
  if(!response.ok)throw new Error(`alert_provider_${response.status}`);
  return {sent:true};
}

async function handleAlert(request,env){
  if(!env.DB)return json({ok:false,error:'The Aria database is not connected.'},{status:503});
  const member=await currentMember(request,env);
  if(!member)return json({ok:false,error:'Member authentication required.'},{status:401});
  if(!(await hasLifelineAccess(env,member.user_id))){
    return json({ok:false,error:'Lifeline escalation is not active for this account.'},{status:403});
  }

  let body={};
  try{body=await request.json();}catch{}
  const level=String(body?.level||'').toLowerCase();
  if(!['high','critical'].includes(level))return json({ok:false,error:'A High Risk or Critical Lifeline classification is required.'},{status:400});

  const contact=await primaryApprovedContact(env,member.user_id);
  if(!contact)return json({ok:false,code:'no_approved_contact',error:'No approved Care Circle contact is available for Lifeline escalation.'},{status:409});

  const firstName=String(member.display_name||'the member').trim().split(/\s+/)[0]||'the member';
  const payload={
    eventId:`LFL-${crypto.randomUUID()}`,
    level,
    member:{id:member.user_id,firstName},
    contact:{id:contact.id,name:contact.display_name,phone:contact.phone,priority:contact.priority},
    message:`Hi, this is Aria AI. You are listed as an emergency contact for ${firstName}. Aria detected a conversation indicating possible serious distress. Please contact or check on them as soon as possible.`,
    location:body?.location&&typeof body.location==='object'?body.location:null,
    occurredAt:new Date().toISOString()
  };

  let providerResult;
  try{
    providerResult=await sendProviderAlert(env,payload);
  }catch(error){
    await recordAudit(env,member,contact,{eventType:'lifeline_contact_alert_failed',payload:{level,reason:'provider_error'}}).catch(()=>{});
    return json({ok:false,code:'provider_error',error:'The Lifeline alert provider could not deliver the approved-contact alert.',contact:{name:contact.display_name,phone:contact.phone}},{status:502});
  }

  if(!providerResult.sent){
    await recordAudit(env,member,contact,{eventType:'lifeline_contact_alert_ready_provider_missing',payload:{level,reason:providerResult.reason}}).catch(()=>{});
    return json({
      ok:false,
      code:'provider_not_configured',
      error:'The approved-contact alert is ready, but no outbound Lifeline messaging provider is configured yet.',
      contact:{name:contact.display_name,phone:contact.phone}
    },{status:503});
  }

  await recordAudit(env,member,contact,{eventType:'lifeline_contact_alert_sent',payload:{level,provider:'webhook'}}).catch(()=>{});
  return json({ok:true,sent:true,eventId:payload.eventId,contact:{name:contact.display_name,priority:contact.priority}});
}

export async function handleLifelineAlertRoute(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/api/member/lifeline/alert'&&request.method==='POST')return handleAlert(request,env);
  return null;
}
