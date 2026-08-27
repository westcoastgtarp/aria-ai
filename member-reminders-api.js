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
  return env.DB.prepare(`SELECT u.id AS user_id,u.email,u.display_name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.account_type='member' AND u.status='active' LIMIT 1`)
    .bind(tokenHash,new Date().toISOString()).first();
}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));}
function localDate(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function toDisplayTime(value){
  const [h,m]=String(value).split(':').map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return value;
  const suffix=h>=12?'PM':'AM';const hour=(h%12)||12;return `${hour}:${String(m).padStart(2,'0')} ${suffix}`;
}
async function audit(env,member,eventType,subjectId,details={}){
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at) VALUES (?, 'Medication', ?, ?, 'medication_reminder', ?, ?, ?, ?)`)
    .bind(`AUD-${crypto.randomUUID()}`,eventType,member.user_id,subjectId,JSON.stringify(details),now,now).run();
}
async function listReminderEvents(request,env,member){
  const url=new URL(request.url);
  const date=validDate(url.searchParams.get('date'))?url.searchParams.get('date'):localDate();
  const rows=await env.DB.prepare(`
    SELECT e.id,e.schedule_id,e.medication_id,e.scheduled_date,e.scheduled_time_local,e.timezone,e.status,
           e.generated_at,e.acknowledged_at,e.dismissed_at,m.name AS medication_name,
           r.id AS dose_record_id,r.recorded_at
    FROM medication_reminder_events e
    JOIN member_medications m ON m.id=e.medication_id AND m.member_user_id=e.member_user_id
    LEFT JOIN medication_dose_records r
      ON r.member_user_id=e.member_user_id
      AND r.schedule_id=e.schedule_id
      AND r.scheduled_date=e.scheduled_date
    WHERE e.member_user_id=? AND e.scheduled_date=?
    ORDER BY e.scheduled_time_local ASC
  `).bind(member.user_id,date).all();
  const events=(rows.results||[]).map(row=>({
    id:row.id,
    scheduleId:row.schedule_id,
    medicationId:row.medication_id,
    medication:row.medication_name,
    scheduledDate:row.scheduled_date,
    timeLocal:row.scheduled_time_local,
    time:toDisplayTime(row.scheduled_time_local),
    timezone:row.timezone,
    status:row.dose_record_id?'acknowledged':row.status,
    generatedAt:row.generated_at,
    acknowledgedAt:row.recorded_at||row.acknowledged_at||null,
    dismissedAt:row.dismissed_at||null
  }));
  return json({ok:true,date,events});
}
async function updateReminderEvent(request,env,member,id){
  const existing=await env.DB.prepare(`SELECT id,status FROM medication_reminder_events WHERE id=? AND member_user_id=? LIMIT 1`).bind(id,member.user_id).first();
  if(!existing)return json({ok:false,error:'Reminder event not found.'},{status:404});
  let body={};try{body=await request.json();}catch{}
  const status=String(body.status||'').trim().toLowerCase();
  if(!['due','acknowledged','dismissed'].includes(status))return json({ok:false,error:'Reminder status must be due, acknowledged, or dismissed.'},{status:400});
  const now=new Date().toISOString();
  await env.DB.prepare(`
    UPDATE medication_reminder_events
    SET status=?,acknowledged_at=?,dismissed_at=?,updated_at=?
    WHERE id=? AND member_user_id=?
  `).bind(status,status==='acknowledged'?now:null,status==='dismissed'?now:null,now,id,member.user_id).run();
  try{await audit(env,member,`member_medication_reminder_${status}`,id);}catch(error){console.error('Reminder audit failed',error);}
  return json({ok:true,id,status,updatedAt:now});
}

export async function handleMemberRemindersRoute(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/member/reminder-events'))return null;
  if(!env.DB)return json({ok:false,error:'The Aria database is not connected.'},{status:503});
  const member=await currentMember(request,env);
  if(!member)return json({ok:false,error:'Member authentication required.'},{status:401});
  if(url.pathname==='/api/member/reminder-events'&&request.method==='GET')return listReminderEvents(request,env,member);
  const match=url.pathname.match(/^\/api\/member\/reminder-events\/([^/]+)$/);
  if(match&&request.method==='PUT')return updateReminderEvent(request,env,member,decodeURIComponent(match[1]));
  return json({ok:false,error:'Not found.'},{status:404});
}
