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
function weekdayForDate(date){const [y,m,d]=date.split('-').map(Number);return new Date(y,m-1,d).getDay();}
function scheduleApplies(days,weekday){return String(days||'').split(',').map(v=>Number(v)).includes(weekday);}
function toDisplayTime(value){
  const [h,m]=String(value).split(':').map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return value;
  const suffix=h>=12?'PM':'AM';const hour=(h%12)||12;return `${hour}:${String(m).padStart(2,'0')} ${suffix}`;
}
function instructionParts(row){
  const strength=clean(row.strength_text,80);
  const amount=clean(row.amount_text,80);
  const frequency=clean(row.frequency_text,80);
  const timing=clean(row.timing_text,80);
  const asNeeded=Boolean(row.as_needed);
  if(!strength&&!amount&&!frequency&&!timing&&!asNeeded)return {strengthText:'',amountText:'',frequencyText:'',timingText:'',asNeeded:false,instructionText:clean(row.dose_text,100)};
  const take=[amount,frequency,timing].filter(Boolean).join(' ');
  return {strengthText:strength,amountText:amount,frequencyText:frequency,timingText:timing,asNeeded,instructionText:[strength,take,asNeeded?'as needed':''].filter(Boolean).join(' — ')};
}
function normalizedDays(value,fallback='0,1,2,3,4,5,6'){
  const raw=Array.isArray(value)?value:String(fallback||'').split(',');
  const days=[...new Set(raw.map(Number).filter(v=>Number.isInteger(v)&&v>=0&&v<=6))].sort((a,b)=>a-b);
  return days.length?days:[0,1,2,3,4,5,6];
}
async function audit(env,member,eventType,subjectType,subjectId,details={}){
  if(!env.DB)return;const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO audit_events (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at) VALUES (?, 'Medication', ?, ?, ?, ?, ?, ?, ?)`)
    .bind(`AUD-${crypto.randomUUID()}`,eventType,member.user_id,subjectType,subjectId,JSON.stringify(details),now,now).run();
}
async function requireMember(request,env){
  if(!env.DB)return {response:json({ok:false,error:'The Aria database is not connected.'},{status:503})};
  const member=await currentMember(request,env);if(!member)return {response:json({ok:false,error:'Member authentication required.'},{status:401})};
  return {member};
}
async function listMedications(request,env,member){
  const url=new URL(request.url);const date=validDate(url.searchParams.get('date'))?url.searchParams.get('date'):todayIso();const weekday=weekdayForDate(date);
  const rows=await env.DB.prepare(`
    SELECT m.id AS medication_id,m.name,m.dose_text,m.notes,m.active AS medication_active,
           m.strength_text,m.amount_text,m.frequency_text,m.timing_text,m.as_needed,
           s.id AS schedule_id,s.time_local,s.days_of_week,s.timezone,s.active AS schedule_active,
           r.id AS record_id,r.recorded_at
    FROM member_medications m
    LEFT JOIN medication_schedules s ON s.medication_id=m.id AND s.member_user_id=m.member_user_id AND s.active=1
    LEFT JOIN medication_dose_records r ON r.schedule_id=s.id AND r.member_user_id=m.member_user_id AND r.scheduled_date=?
    WHERE m.member_user_id=? AND m.active=1
    ORDER BY m.created_at ASC,s.time_local ASC
  `).bind(date,member.user_id).all();
  const medications=new Map();const doses=[];
  for(const row of rows.results||[]){
    const instruction=instructionParts(row);
    if(!medications.has(row.medication_id))medications.set(row.medication_id,{id:row.medication_id,name:row.name,doseText:row.dose_text,notes:row.notes||'',...instruction,schedules:[]});
    if(row.schedule_id){
      const schedule={id:row.schedule_id,timeLocal:row.time_local,time:toDisplayTime(row.time_local),daysOfWeek:String(row.days_of_week||'').split(',').filter(Boolean).map(Number),timezone:row.timezone||null};
      medications.get(row.medication_id).schedules.push(schedule);
      if(scheduleApplies(row.days_of_week,weekday))doses.push({
        id:`${row.schedule_id}:${date}`,scheduleId:row.schedule_id,medicationId:row.medication_id,medication:row.name,
        detail:`${instruction.instructionText||row.dose_text} • user-entered`,instructionText:instruction.instructionText||row.dose_text,
        timeLocal:row.time_local,time:toDisplayTime(row.time_local),checked:Boolean(row.record_id),recordedAt:row.recorded_at||null,
        recorded:row.recorded_at?new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit'}).format(new Date(row.recorded_at)):null,scheduledDate:date
      });
    }
  }
  doses.sort((a,b)=>a.timeLocal.localeCompare(b.timeLocal));
  return json({ok:true,date,medications:[...medications.values()],doses});
}
async function createMedication(request,env,member){
  let body={};try{body=await request.json();}catch{}
  const name=clean(body.name,100);const strengthText=clean(body.strengthText,80);const amountText=clean(body.amountText,80);
  const frequencyText=clean(body.frequencyText,80);const timingText=clean(body.timingText,80);const asNeeded=body.asNeeded===true;
  const timeLocal=clean(body.timeLocal||body.time,5);const notes=clean(body.notes,500);
  if(!name)return json({ok:false,error:'Medication name is required.'},{status:400});
  if(!strengthText)return json({ok:false,error:'Medication strength is required, such as 200 mg or 5 mL.'},{status:400});
  if(!amountText)return json({ok:false,error:'Amount to take is required, such as 1 tablet or 2 mL.'},{status:400});
  if(!asNeeded&&!frequencyText)return json({ok:false,error:'Frequency is required for a scheduled medication.'},{status:400});
  if(!asNeeded&&!timingText)return json({ok:false,error:'Timing is required for a scheduled medication, such as every morning.'},{status:400});
  if(!asNeeded&&!validTime(timeLocal))return json({ok:false,error:'Scheduled medications need a reminder time in 24-hour HH:MM format.'},{status:400});
  const doseText=[strengthText,amountText].filter(Boolean).join(' • ');
  const medicationId=`MED-${crypto.randomUUID()}`;const scheduleId=asNeeded?null:`SCH-${crypto.randomUUID()}`;const now=new Date().toISOString();
  const statements=[env.DB.prepare(`INSERT INTO member_medications (id,member_user_id,name,dose_text,notes,active,created_at,updated_at,strength_text,amount_text,frequency_text,timing_text,as_needed) VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?)`).bind(medicationId,member.user_id,name,doseText,notes||null,now,now,strengthText,amountText,frequencyText||null,timingText||null,asNeeded?1:0)];
  if(!asNeeded)statements.push(env.DB.prepare(`INSERT INTO medication_schedules (id,member_user_id,medication_id,time_local,days_of_week,timezone,active,created_at,updated_at) VALUES (?,?,?,?,'0,1,2,3,4,5,6',?,1,?,?)`).bind(scheduleId,member.user_id,medicationId,timeLocal,clean(body.timezone,80)||null,now,now));
  await env.DB.batch(statements);
  try{await audit(env,member,'member_medication_created','medication',medicationId,{scheduleCount:asNeeded?0:1,asNeeded});}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true,medication:{id:medicationId,name,strengthText,amountText,frequencyText,timingText,asNeeded,doseText,notes,schedules:asNeeded?[]:[{id:scheduleId,timeLocal,time:toDisplayTime(timeLocal)}]}},{status:201});
}
async function updateMedication(request,env,member,medicationId){
  const existing=await env.DB.prepare(`SELECT id,name,dose_text,notes,strength_text,amount_text,frequency_text,timing_text,as_needed FROM member_medications WHERE id=? AND member_user_id=? AND active=1 LIMIT 1`).bind(medicationId,member.user_id).first();
  if(!existing)return json({ok:false,error:'Medication not found.'},{status:404});
  const scheduleRows=await env.DB.prepare(`SELECT id,time_local,days_of_week,timezone FROM medication_schedules WHERE medication_id=? AND member_user_id=? AND active=1 ORDER BY created_at ASC`).bind(medicationId,member.user_id).all();
  const schedules=scheduleRows.results||[];
  let body={};try{body=await request.json();}catch{}
  const requestedScheduleId=clean(body.scheduleId,160);
  const primary=schedules.find(row=>row.id===requestedScheduleId)||schedules[0]||null;
  const name=body.name===undefined?existing.name:clean(body.name,100);
  const strengthText=body.strengthText===undefined?clean(existing.strength_text,80):clean(body.strengthText,80);
  const amountText=body.amountText===undefined?clean(existing.amount_text,80):clean(body.amountText,80);
  const frequencyText=body.frequencyText===undefined?clean(existing.frequency_text,80):clean(body.frequencyText,80);
  const timingText=body.timingText===undefined?clean(existing.timing_text,80):clean(body.timingText,80);
  const asNeeded=body.asNeeded===undefined?Boolean(existing.as_needed):body.asNeeded===true;
  const notes=body.notes===undefined?(existing.notes||''):clean(body.notes,500);
  const timeLocal=asNeeded?'':clean(body.timeLocal===undefined?(primary?.time_local||''):body.timeLocal,5);
  const timezone=clean(body.timezone===undefined?(primary?.timezone||''):body.timezone,80)||null;
  const days=normalizedDays(body.daysOfWeek,primary?.days_of_week||'0,1,2,3,4,5,6');
  if(!name)return json({ok:false,error:'Medication name is required.'},{status:400});
  if(!strengthText)return json({ok:false,error:'Medication strength is required.'},{status:400});
  if(!amountText)return json({ok:false,error:'Amount to take is required.'},{status:400});
  if(!asNeeded&&!frequencyText)return json({ok:false,error:'Frequency is required for a scheduled medication.'},{status:400});
  if(!asNeeded&&!timingText)return json({ok:false,error:'Timing is required for a scheduled medication.'},{status:400});
  if(!asNeeded&&!validTime(timeLocal))return json({ok:false,error:'Scheduled medications need a valid reminder time.'},{status:400});

  const doseText=[strengthText,amountText].filter(Boolean).join(' • ');
  const now=new Date().toISOString();
  const statements=[env.DB.prepare(`UPDATE member_medications SET name=?,dose_text=?,notes=?,strength_text=?,amount_text=?,frequency_text=?,timing_text=?,as_needed=?,updated_at=? WHERE id=? AND member_user_id=?`).bind(name,doseText,notes||null,strengthText,amountText,frequencyText||null,timingText||null,asNeeded?1:0,now,medicationId,member.user_id)];
  let activeScheduleId=primary?.id||null;
  let scheduleChanged=false;

  if(asNeeded){
    if(schedules.length){
      scheduleChanged=true;
      statements.push(env.DB.prepare(`UPDATE medication_schedules SET active=0,updated_at=? WHERE medication_id=? AND member_user_id=? AND active=1`).bind(now,medicationId,member.user_id));
      statements.push(env.DB.prepare(`UPDATE medication_reminder_events SET status='expired',updated_at=? WHERE medication_id=? AND member_user_id=? AND status='due'`).bind(now,medicationId,member.user_id));
    }
    activeScheduleId=null;
  }else{
    const currentDays=primary?normalizedDays(null,primary.days_of_week).join(','):'';
    const desiredDays=days.join(',');
    const changed=!primary||primary.time_local!==timeLocal||(primary.timezone||null)!==timezone||currentDays!==desiredDays;
    if(changed){
      scheduleChanged=true;
      if(primary){
        statements.push(env.DB.prepare(`UPDATE medication_schedules SET active=0,updated_at=? WHERE id=? AND member_user_id=?`).bind(now,primary.id,member.user_id));
        statements.push(env.DB.prepare(`UPDATE medication_reminder_events SET status='expired',updated_at=? WHERE schedule_id=? AND member_user_id=? AND status='due'`).bind(now,primary.id,member.user_id));
      }
      activeScheduleId=`SCH-${crypto.randomUUID()}`;
      statements.push(env.DB.prepare(`INSERT INTO medication_schedules (id,member_user_id,medication_id,time_local,days_of_week,timezone,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`).bind(activeScheduleId,member.user_id,medicationId,timeLocal,desiredDays,timezone,now,now));
    }
  }

  await env.DB.batch(statements);
  try{await audit(env,member,'member_medication_updated','medication',medicationId,{asNeeded,scheduleChanged});}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true,medication:{id:medicationId,name,strengthText,amountText,frequencyText,timingText,asNeeded,doseText,notes},schedule:activeScheduleId?{id:activeScheduleId,timeLocal,time:toDisplayTime(timeLocal),daysOfWeek:days,timezone}:null});
}
async function deactivateMedication(env,member,medicationId){
  const existing=await env.DB.prepare(`SELECT id FROM member_medications WHERE id=? AND member_user_id=? AND active=1 LIMIT 1`).bind(medicationId,member.user_id).first();
  if(!existing)return json({ok:false,error:'Medication not found.'},{status:404});
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE member_medications SET active=0,updated_at=? WHERE id=? AND member_user_id=?`).bind(now,medicationId,member.user_id),
    env.DB.prepare(`UPDATE medication_schedules SET active=0,updated_at=? WHERE medication_id=? AND member_user_id=?`).bind(now,medicationId,member.user_id),
    env.DB.prepare(`UPDATE medication_reminder_events SET status='expired',updated_at=? WHERE medication_id=? AND member_user_id=? AND status='due'`).bind(now,medicationId,member.user_id)
  ]);
  try{await audit(env,member,'member_medication_deactivated','medication',medicationId);}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true});
}
async function addSchedule(request,env,member,medicationId){
  const medication=await env.DB.prepare(`SELECT id FROM member_medications WHERE id=? AND member_user_id=? AND active=1 LIMIT 1`).bind(medicationId,member.user_id).first();
  if(!medication)return json({ok:false,error:'Medication not found.'},{status:404});
  let body={};try{body=await request.json();}catch{}
  const timeLocal=clean(body.timeLocal||body.time,5);if(!validTime(timeLocal))return json({ok:false,error:'Reminder time must use 24-hour HH:MM format.'},{status:400});
  const days=normalizedDays(body.daysOfWeek);
  const id=`SCH-${crypto.randomUUID()}`;const now=new Date().toISOString();
  await env.DB.prepare(`INSERT INTO medication_schedules (id,member_user_id,medication_id,time_local,days_of_week,timezone,active,created_at,updated_at) VALUES (?,?,?,?,?,?,1,?,?)`).bind(id,member.user_id,medicationId,timeLocal,days.join(','),clean(body.timezone,80)||null,now,now).run();
  try{await audit(env,member,'member_medication_schedule_created','medication_schedule',id,{medicationId});}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true,schedule:{id,timeLocal,time:toDisplayTime(timeLocal),daysOfWeek:days}},{status:201});
}
async function removeSchedule(env,member,scheduleId){
  const schedule=await env.DB.prepare(`SELECT id FROM medication_schedules WHERE id=? AND member_user_id=? AND active=1 LIMIT 1`).bind(scheduleId,member.user_id).first();
  if(!schedule)return json({ok:false,error:'Reminder not found.'},{status:404});
  const now=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare(`UPDATE medication_schedules SET active=0,updated_at=? WHERE id=? AND member_user_id=?`).bind(now,scheduleId,member.user_id),
    env.DB.prepare(`UPDATE medication_reminder_events SET status='expired',updated_at=? WHERE schedule_id=? AND member_user_id=? AND status='due'`).bind(now,scheduleId,member.user_id)
  ]);
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
