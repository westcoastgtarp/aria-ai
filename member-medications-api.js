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
function clean(value,max){return String(value||'').trim().slice(0,max);}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));}
function validTime(value){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));}
function todayIso(){
  const d=new Date();
  const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function weekdayForDate(date){
  const [y,m,d]=date.split('-').map(Number);
  return new Date(y,m-1,d).getDay();
}
function scheduleApplies(days,weekday){return String(days||'').split(',').map(v=>Number(v)).includes(weekday);}
function toDisplayTime(value){
  const [h,m]=String(value).split(':').map(Number);
  if(!Number.isFinite(h)||!Number.isFinite(m))return value;
  const suffix=h>=12?'PM':'AM';const hour=(h%12)||12;
  return `${hour}:${String(m).padStart(2,'0')} ${suffix}`;
}
async function audit(env,member,eventType,subjectType,subjectId,details={}){
  if(!env.DB)return;
  const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at) VALUES (?, 'Medication', ?, ?, ?, ?, ?, ?, ?)`)
    .bind(`AUD-${crypto.randomUUID()}`,eventType,member.user_id,subjectType,subjectId,JSON.stringify(details),now,now).run();
}
async function requireMember(request,env){
  if(!env.DB)return {response:json({ok:false,error:'The Aria database is not connected.'},{status:503})};
  const member=await currentMember(request,env);
  if(!member)return {response:json({ok:false,error:'Member authentication required.'},{status:401})};
  return {member};
}
async function listMedications(request,env,member){
  const url=new URL(request.url);
  const date=validDate(url.searchParams.get('date'))?url.searchParams.get('date'):todayIso();
  const weekday=weekdayForDate(date);
  const rows=await env.DB.prepare(`
    SELECT m.id AS medication_id,m.name,m.dose_text,m.notes,m.active AS medication_active,
           s.id AS schedule_id,s.time_local,s.days_of_week,s.timezone,s.active AS schedule_active,
           r.id AS record_id,r.recorded_at
    FROM member_medications m
    LEFT JOIN medication_schedules s ON s.medication_id=m.id AND s.member_user_id=m.member_user_id AND s.active=1
    LEFT JOIN medication_dose_records r ON r.schedule_id=s.id AND r.member_user_id=m.member_user_id AND r.scheduled_date=?
    WHERE m.member_user_id=? AND m.active=1
    ORDER BY m.created_at ASC,s.time_local ASC
  `).bind(date,member.user_id).all();
  const medications=new Map();
  const doses=[];
  for(const row of rows.results||[]){
    if(!medications.has(row.medication_id))medications.set(row.medication_id,{id:row.medication_id,name:row.name,doseText:row.dose_text,notes:row.notes||'',schedules:[]});
    if(row.schedule_id){
      const schedule={id:row.schedule_id,timeLocal:row.time_local,time:toDisplayTime(row.time_local),daysOfWeek:String(row.days_of_week||'').split(',').filter(Boolean).map(Number),timezone:row.timezone||null};
      medications.get(row.medication_id).schedules.push(schedule);
      if(scheduleApplies(row.days_of_week,weekday))doses.push({
        id:`${row.schedule_id}:${date}`,
        scheduleId:row.schedule_id,
        medicationId:row.medication_id,
        medication:row.name,
        detail:`${row.dose_text} • user-entered`,
        timeLocal:row.time_local,
        time:toDisplayTime(row.time_local),
        checked:Boolean(row.record_id),
        recordedAt:row.recorded_at||null,
        recorded:row.recorded_at?new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date(row.recorded_at)):null,
        scheduledDate:date
      });
    }
  }
  doses.sort((a,b)=>a.timeLocal.localeCompare(b.timeLocal));
  return json({ok:true,date,medications:[...medications.values()],doses});
}
async function createMedication(request,env,member){
  let body={};try{body=await request.json();}catch{}
  const name=clean(body.name,100);const doseText=clean(body.doseText||body.dose,100);const timeLocal=clean(body.timeLocal||body.time,5);const notes=clean(body.notes,500);
  if(!name)return json({ok:false,error:'Medication name is required.'},{status:400});
  if(!doseText)return json({ok:false,error:'Dose text is required.'},{status:400});
  if(!validTime(timeLocal))return json({ok:false,error:'Reminder time must use 24-hour HH:MM format.'},{status:400});
  const medicationId=`MED-${crypto.randomUUID()}`;const scheduleId=`SCH-${crypto.randomUUID()}`;const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO member_medications (id,member_user_id,name,dose_text,notes,active,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)`).bind(medicationId,member.user_id,name,doseText,notes||null,now,now),
    env.DB.prepare(`INSERT INTO medication_schedules (id,member_user_id,medication_id,time_local,days_of_week,timezone,active,created_at,updated_at) VALUES (?,?,?,?,'0,1,2,3,4,5,6',?,1,?,?)`).bind(scheduleId,member.user_id,medicationId,timeLocal,clean(body.timezone,80)||null,now,now)
  ]);
  try{await audit(env,member,'member_medication_created','medication',medicationId,{scheduleCount:1});}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true,medication:{id:medicationId,name,doseText,notes,schedules:[{id:scheduleId,timeLocal,time:toDisplayTime(timeLocal)}]}},{status:201});
}
async function updateMedication(request,env,member,medicationId){
  const existing=await env.DB.prepare(`SELECT id,name,dose_text,notes FROM member_medications WHERE id=? AND member_user_id=? AND active=1 LIMIT 1`).bind(medicationId,member.user_id).first();
  if(!existing)return json({ok:false,error:'Medication not found.'},{status:404});
  let body={};try{body=await request.json();}catch{}
  const name=body.name===undefined?existing.name:clean(body.name,100);
  const doseText=body.doseText===undefined?existing.dose_text:clean(body.doseText,100);
  const notes=body.notes===undefined?(existing.notes||''):clean(body.notes,500);
  if(!name||!doseText)return json({ok:false,error:'Medication name and dose text are required.'},{status:400});
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE member_medications SET name=?,dose_text=?,notes=?,updated_at=? WHERE id=? AND member_user_id=?`).bind(name,doseText,notes||null,now,medicationId,member.user_id).run();
  try{await audit(env,member,'member_medication_updated','medication',medicationId);}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true});
}
async function deactivateMedication(env,member,medicationId){
  const existing=await env.DB.prepare(`SELECT id FROM member_medications WHERE id=? AND member_user_id=? AND active=1 LIMIT 1`).bind(medicationId,member.user_id).first();
  if(!existing)return json({ok:false,error:'Medication not found.'},{status:404});
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE member_medications SET active=0,updated_at=? WHERE id=? AND member_user_id=?`).bind(now,medicationId,member.user_id),
    env.DB.prepare(`UPDATE medication_schedules SET active=0,updated_at=? WHERE medication_id=? AND member_user_id=?`).bind(now,medicationId,member.user_id)
  ]);
  try{await audit(env,member,'member_medication_deactivated','medication',medicationId);}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true});
}
async function addSchedule(request,env,member,medicationId){
  const medication=await env.DB.prepare(`SELECT id FROM member_medications WHERE id=? AND member_user_id=? AND active=1 LIMIT 1`).bind(medicationId,member.user_id).first();
  if(!medication)return json({ok:false,error:'Medication not found.'},{status:404});
  let body={};try{body=await request.json();}catch{}
  const timeLocal=clean(body.timeLocal||body.time,5);if(!validTime(timeLocal))return json({ok:false,error:'Reminder time must use 24-hour HH:MM format.'},{status:400});
  const supplied=Array.isArray(body.daysOfWeek)?body.daysOfWeek.map(Number).filter(v=>Number.isInteger(v)&&v>=0&&v<=6):[0,1,2,3,4,5,6];
  const days=[...new Set(supplied)].sort((a,b)=>a-b);if(!days.length)return json({ok:false,error:'At least one day is required.'},{status:400});
  const id=`SCH-${crypto.randomUUID()}`;const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO medication_schedules (id,member_user_id,medication_id,time_local,days_of_week,timezone,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`).bind(id,member.user_id,medicationId,timeLocal,days.join(','),clean(body.timezone,80)||null,now,now).run();
  try{await audit(env,member,'member_medication_schedule_created','medication_schedule',id,{medicationId});}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true,schedule:{id,timeLocal,time:toDisplayTime(timeLocal),daysOfWeek:days}},{status:201});
}
async function removeSchedule(env,member,scheduleId){
  const schedule=await env.DB.prepare(`SELECT id FROM medication_schedules WHERE id=? AND member_user_id=? AND active=1 LIMIT 1`).bind(scheduleId,member.user_id).first();
  if(!schedule)return json({ok:false,error:'Reminder not found.'},{status:404});
  const now=new Date().toISOString();
  await env.DB.prepare(`UPDATE medication_schedules SET active=0,updated_at=? WHERE id=? AND member_user_id=?`).bind(now,scheduleId,member.user_id).run();
  try{await audit(env,member,'member_medication_schedule_deactivated','medication_schedule',scheduleId);}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true});
}
async function setDoseRecord(request,env,member,scheduleId){
  let body={};try{body=await request.json();}catch{}
  const date=validDate(body.date)?body.date:todayIso();const recorded=body.recorded!==false;
  const schedule=await env.DB.prepare(`SELECT s.id,s.medication_id,s.time_local,s.days_of_week FROM medication_schedules s JOIN member_medications m ON m.id=s.medication_id WHERE s.id=? AND s.member_user_id=? AND s.active=1 AND m.active=1 LIMIT 1`).bind(scheduleId,member.user_id).first();
  if(!schedule)return json({ok:false,error:'Scheduled dose not found.'},{status:404});
  if(!scheduleApplies(schedule.days_of_week,weekdayForDate(date)))return json({ok:false,error:'This reminder is not scheduled for that date.'},{status:400});
  const now=new Date().toISOString();
  if(recorded){
    await env.DB.prepare(`INSERT INTO medication_dose_records (id,member_user_id,medication_id,schedule_id,scheduled_date,scheduled_time_local,recorded_at,source,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'member',?,?) ON CONFLICT(member_user_id,schedule_id,scheduled_date) DO UPDATE SET recorded_at=excluded.recorded_at,updated_at=excluded.updated_at`).bind(`DOSE-${crypto.randomUUID()}`,member.user_id,schedule.medication_id,schedule.id,date,schedule.time_local,now,now,now).run();
    try{await audit(env,member,'member_dose_recorded','medication_schedule',scheduleId,{scheduledDate:date});}catch(error){console.error('Medication audit failed',error);}
    return json({ok:true,recorded:true,recordedAt:now});
  }
  await env.DB.prepare(`DELETE FROM medication_dose_records WHERE member_user_id=? AND schedule_id=? AND scheduled_date=?`).bind(member.user_id,scheduleId,date).run();
  try{await audit(env,member,'member_dose_record_cleared','medication_schedule',scheduleId,{scheduledDate:date});}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true,recorded:false,recordedAt:null});
}

export async function handleMemberMedicationsRoute(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/member/medications')&&!url.pathname.startsWith('/api/member/dose-records'))return null;
  const auth=await requireMember(request,env);if(auth.response)return auth.response;const member=auth.member;

  if(url.pathname==='/api/member/medications'&&request.method==='GET')return listMedications(request,env,member);
  if(url.pathname==='/api/member/medications'&&request.method==='POST')return createMedication(request,env,member);

  let match=url.pathname.match(/^\/api\/member\/medications\/([^/]+)$/);
  if(match&&request.method==='PATCH')return updateMedication(request,env,member,decodeURIComponent(match[1]));
  if(match&&request.method==='DELETE')return deactivateMedication(env,member,decodeURIComponent(match[1]));

  match=url.pathname.match(/^\/api\/member\/medications\/([^/]+)\/schedules$/);
  if(match&&request.method==='POST')return addSchedule(request,env,member,decodeURIComponent(match[1]));

  match=url.pathname.match(/^\/api\/member\/medications\/schedules\/([^/]+)$/);
  if(match&&request.method==='DELETE')return removeSchedule(env,member,decodeURIComponent(match[1]));

  match=url.pathname.match(/^\/api\/member\/dose-records\/([^/]+)$/);
  if(match&&request.method==='PUT')return setDoseRecord(request,env,member,decodeURIComponent(match[1]));

  return json({ok:false,error:'Not found.'},{status:404});
}
