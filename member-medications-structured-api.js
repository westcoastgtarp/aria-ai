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
function clean(value,max){return String(value??'').trim().slice(0,max);}
function validTime(value){return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value||''));}
function toDisplayTime(value){
  const [h,m]=String(value).split(':').map(Number);if(!Number.isFinite(h)||!Number.isFinite(m))return value;
  const suffix=h>=12?'PM':'AM';return `${(h%12)||12}:${String(m).padStart(2,'0')} ${suffix}`;
}

const ALLOWED_UNITS=new Set([
  'mcg','mg','g','mL','L','fl oz','oz','tsp','tbsp','IU','unit','units',
  'tablet','tablets','capsule','capsules','softgel','softgels','drop','drops',
  'puff','puffs','spray','sprays','patch','patches','packet','packets','scoop','scoops',
  'lozenge','lozenges','suppository','suppositories','inhalation','inhalations',
  'application','applications'
]);

async function currentMember(request,env){
  if(!env.DB)return null;
  const token=parseCookies(request).aria_session;if(!token)return null;
  const tokenHash=await sha256(token);
  return env.DB.prepare(`
    SELECT u.id AS user_id,u.email,u.display_name
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>?
      AND u.account_type='member' AND u.status='active'
    LIMIT 1
  `).bind(tokenHash,new Date().toISOString()).first();
}

async function requireMember(request,env){
  if(!env.DB)return {response:json({ok:false,error:'The Aria database is not connected.'},{status:503})};
  const member=await currentMember(request,env);
  if(!member)return {response:json({ok:false,error:'Member authentication required.'},{status:401})};
  return {member};
}

async function audit(env,member,eventType,medicationId,details={}){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO audit_events
      (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at)
    VALUES (?, 'Medication', ?, ?, 'medication', ?, ?, ?, ?)
  `).bind(`AUD-${crypto.randomUUID()}`,eventType,member.user_id,medicationId,JSON.stringify(details),now,now).run();
}

function frequencyLabel(count){
  return ({1:'once daily',2:'twice daily',3:'three times daily',4:'four times daily'})[count]||`${count} times daily`;
}
function slotLabels(count){
  if(count===1)return ['Reminder'];
  if(count===2)return ['AM','Night'];
  if(count===3)return ['AM','Afternoon','Night'];
  return ['AM','Midday','Evening','Night'];
}
function timingLabel(times){
  const labels=slotLabels(times.length);
  return times.map((time,index)=>`${labels[index]} ${toDisplayTime(time)}`).join(' • ');
}

function parseStructuredBody(body){
  const name=clean(body?.name,100);
  const doseAmount=clean(body?.doseAmount,20);
  const requestedUnit=clean(body?.doseUnit,40);
  const customUnit=clean(body?.customDoseUnit,40);
  const asNeeded=body?.asNeeded===true;
  const timesPerDay=asNeeded?0:Number(body?.timesPerDay||1);
  const timezone=clean(body?.timezone,80)||null;
  const rawTimes=Array.isArray(body?.scheduleTimes)?body.scheduleTimes:[];
  const suppliedTimes=rawTimes.slice(0,4).map(value=>clean(value,5));
  const invalidSuppliedTime=suppliedTimes.some(time=>time&&!validTime(time));
  const scheduleTimes=suppliedTimes.filter(Boolean).sort();

  let doseUnit=requestedUnit;
  if(requestedUnit==='other')doseUnit=customUnit;

  if(!name)return {error:'Medication name is required.'};
  if(!doseAmount)return {error:'Dose amount is required, such as 200 or 5.'};
  if(!doseUnit)return {error:'Choose a dose unit or enter an Other unit.'};
  if(requestedUnit!=='other'&&!ALLOWED_UNITS.has(requestedUnit))return {error:'Choose a valid dose unit from the list.'};
  if(asNeeded)return {value:{name,doseAmount,doseUnit,asNeeded:true,timesPerDay:0,scheduleTimes:[],timezone}};
  if(!Number.isInteger(timesPerDay)||timesPerDay<1||timesPerDay>4)return {error:'Times per day must be between 1 and 4.'};
  if(invalidSuppliedTime)return {error:'Choose valid reminder times or leave unused reminder fields blank.'};
  if(scheduleTimes.length!==timesPerDay){
    return {error:`You selected ${timesPerDay} time${timesPerDay===1?'':'s'} per day. Fill exactly ${timesPerDay} reminder time${timesPerDay===1?'':'s'} and leave unused reminder fields blank.`};
  }
  if(new Set(scheduleTimes).size!==scheduleTimes.length)return {error:'Each reminder time must be different.'};
  return {value:{name,doseAmount,doseUnit,asNeeded:false,timesPerDay,scheduleTimes,timezone}};
}

function medicationFields(value){
  const strengthText=`${value.doseAmount} ${value.doseUnit}`;
  const frequencyText=value.asNeeded?'':frequencyLabel(value.timesPerDay);
  const timingText=value.asNeeded?'':timingLabel(value.scheduleTimes);
  return {strengthText,frequencyText,timingText,doseText:strengthText};
}

async function createMedication(request,env,member){
  let body={};try{body=await request.json();}catch{}
  const parsed=parseStructuredBody(body);if(parsed.error)return json({ok:false,error:parsed.error},{status:400});
  const value=parsed.value;const fields=medicationFields(value);
  const medicationId=`MED-${crypto.randomUUID()}`;const now=new Date().toISOString();
  const statements=[
    env.DB.prepare(`
      INSERT INTO member_medications
        (id,member_user_id,name,dose_text,notes,active,created_at,updated_at,strength_text,amount_text,frequency_text,timing_text,as_needed)
      VALUES (?,?,?,?,NULL,1,?,?,?,?,?,?,?)
    `).bind(medicationId,member.user_id,value.name,fields.doseText,now,now,fields.strengthText,null,fields.frequencyText||null,fields.timingText||null,value.asNeeded?1:0)
  ];
  const schedules=[];
  for(const timeLocal of value.scheduleTimes){
    const id=`SCH-${crypto.randomUUID()}`;
    statements.push(env.DB.prepare(`
      INSERT INTO medication_schedules
        (id,member_user_id,medication_id,time_local,days_of_week,timezone,active,created_at,updated_at)
      VALUES (?,?,?,?,'0,1,2,3,4,5,6',?,1,?,?)
    `).bind(id,member.user_id,medicationId,timeLocal,value.timezone,now,now));
    schedules.push({id,timeLocal,time:toDisplayTime(timeLocal),timezone:value.timezone});
  }
  await env.DB.batch(statements);
  try{await audit(env,member,'member_medication_created',medicationId,{structuredDosing:true,scheduleCount:schedules.length,timesPerDay:value.timesPerDay,asNeeded:value.asNeeded,doseUnit:value.doseUnit});}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true,medication:{id:medicationId,name:value.name,doseAmount:value.doseAmount,doseUnit:value.doseUnit,asNeeded:value.asNeeded,timesPerDay:value.timesPerDay,schedules}},{status:201});
}

async function updateMedication(request,env,member,medicationId){
  const existing=await env.DB.prepare(`
    SELECT id,notes FROM member_medications
    WHERE id=? AND member_user_id=? AND active=1 LIMIT 1
  `).bind(medicationId,member.user_id).first();
  if(!existing)return json({ok:false,error:'Medication not found.'},{status:404});

  let body={};try{body=await request.json();}catch{}
  const parsed=parseStructuredBody(body);if(parsed.error)return json({ok:false,error:parsed.error},{status:400});
  const value=parsed.value;const fields=medicationFields(value);const now=new Date().toISOString();

  const activeRows=await env.DB.prepare(`
    SELECT id,time_local,days_of_week,timezone
    FROM medication_schedules
    WHERE medication_id=? AND member_user_id=? AND active=1
    ORDER BY time_local ASC
  `).bind(medicationId,member.user_id).all();
  const active=activeRows.results||[];
  const requestedTimes=value.scheduleTimes;
  const sameSchedule=!value.asNeeded&&active.length===requestedTimes.length&&active.every((row,index)=>
    row.time_local===requestedTimes[index]&&String(row.days_of_week||'')==='0,1,2,3,4,5,6'&&(row.timezone||null)===(value.timezone||null)
  );
  const scheduleChanged=value.asNeeded?active.length>0:!sameSchedule;

  const statements=[
    env.DB.prepare(`
      UPDATE member_medications
      SET name=?,dose_text=?,strength_text=?,amount_text=NULL,frequency_text=?,timing_text=?,as_needed=?,updated_at=?
      WHERE id=? AND member_user_id=?
    `).bind(value.name,fields.doseText,fields.strengthText,fields.frequencyText||null,fields.timingText||null,value.asNeeded?1:0,now,medicationId,member.user_id)
  ];

  if(scheduleChanged&&active.length){
    statements.push(env.DB.prepare(`UPDATE medication_schedules SET active=0,updated_at=? WHERE medication_id=? AND member_user_id=? AND active=1`).bind(now,medicationId,member.user_id));
    statements.push(env.DB.prepare(`UPDATE medication_reminder_events SET status='expired',updated_at=? WHERE medication_id=? AND member_user_id=? AND status='due'`).bind(now,medicationId,member.user_id));
  }

  const schedules=[];
  if(!value.asNeeded){
    if(sameSchedule){
      for(const row of active)schedules.push({id:row.id,timeLocal:row.time_local,time:toDisplayTime(row.time_local),timezone:row.timezone||null});
    }else{
      for(const timeLocal of requestedTimes){
        const id=`SCH-${crypto.randomUUID()}`;
        statements.push(env.DB.prepare(`
          INSERT INTO medication_schedules
            (id,member_user_id,medication_id,time_local,days_of_week,timezone,active,created_at,updated_at)
          VALUES (?,?,?,?,'0,1,2,3,4,5,6',?,1,?,?)
        `).bind(id,member.user_id,medicationId,timeLocal,value.timezone,now,now));
        schedules.push({id,timeLocal,time:toDisplayTime(timeLocal),timezone:value.timezone});
      }
    }
  }

  await env.DB.batch(statements);
  try{await audit(env,member,'member_medication_updated',medicationId,{structuredDosing:true,scheduleChanged,scheduleCount:schedules.length,timesPerDay:value.timesPerDay,asNeeded:value.asNeeded,doseUnit:value.doseUnit});}catch(error){console.error('Medication audit failed',error);}
  return json({ok:true,medication:{id:medicationId,name:value.name,doseAmount:value.doseAmount,doseUnit:value.doseUnit,asNeeded:value.asNeeded,timesPerDay:value.timesPerDay,schedules}});
}

export async function handleStructuredMemberMedicationRoute(request,env){
  const url=new URL(request.url);
  const isCreate=url.pathname==='/api/member/medications'&&request.method==='POST';
  const match=url.pathname.match(/^\/api\/member\/medications\/([^/]+)$/);
  const isUpdate=Boolean(match)&&request.method==='PATCH';
  if(!isCreate&&!isUpdate)return null;

  const auth=await requireMember(request,env);if(auth.response)return auth.response;
  try{
    if(isCreate)return await createMedication(request,env,auth.member);
    return await updateMedication(request,env,auth.member,decodeURIComponent(match[1]));
  }catch(error){
    console.error('Structured medication route failed',error);
    return json({ok:false,error:'Aria could not save that medication right now.'},{status:500});
  }
}
