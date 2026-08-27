function normalizedTimeZone(value){
  const candidate=String(value||'').trim()||'UTC';
  try{
    new Intl.DateTimeFormat('en-US',{timeZone:candidate}).format(new Date());
    return candidate;
  }catch{
    return 'UTC';
  }
}

function localParts(date,timeZone){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone,
    year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23',weekday:'short'
  }).formatToParts(date);
  const values=Object.fromEntries(parts.map(part=>[part.type,part.value]));
  const weekdayMap={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6};
  return {
    date:`${values.year}-${values.month}-${values.day}`,
    time:`${values.hour}:${values.minute}`,
    weekday:weekdayMap[values.weekday]
  };
}

function scheduleApplies(daysOfWeek,weekday){
  return String(daysOfWeek||'')
    .split(',')
    .map(value=>Number(value))
    .filter(Number.isInteger)
    .includes(weekday);
}

async function repairPrematureExpiredEvents(env,now){
  const zones=await env.DB.prepare(`
    SELECT DISTINCT timezone
    FROM medication_reminder_events
    WHERE status='expired'
  `).all();

  let repaired=0;
  const updatedAt=now.toISOString();

  for(const row of zones.results||[]){
    const storedTimezone=String(row.timezone||'UTC');
    const timezone=normalizedTimeZone(storedTimezone);
    const local=localParts(now,timezone);
    const result=await env.DB.prepare(`
      UPDATE medication_reminder_events
      SET status='due',updated_at=?
      WHERE status='expired'
        AND timezone=?
        AND scheduled_date=?
        AND EXISTS (
          SELECT 1
          FROM medication_schedules s
          JOIN member_medications m
            ON m.id=s.medication_id
           AND m.member_user_id=s.member_user_id
          WHERE s.id=medication_reminder_events.schedule_id
            AND s.member_user_id=medication_reminder_events.member_user_id
            AND s.active=1
            AND m.active=1
        )
        AND NOT EXISTS (
          SELECT 1
          FROM medication_dose_records r
          WHERE r.member_user_id=medication_reminder_events.member_user_id
            AND r.schedule_id=medication_reminder_events.schedule_id
            AND r.scheduled_date=medication_reminder_events.scheduled_date
        )
    `).bind(updatedAt,storedTimezone,local.date).run();
    repaired+=Number(result?.meta?.changes||0);
  }

  return repaired;
}

async function expireStaleDueEvents(env,now){
  const zones=await env.DB.prepare(`
    SELECT DISTINCT timezone
    FROM medication_reminder_events
    WHERE status='due'
  `).all();

  let expired=0;
  const updatedAt=now.toISOString();

  for(const row of zones.results||[]){
    const storedTimezone=String(row.timezone||'UTC');
    const timezone=normalizedTimeZone(storedTimezone);
    const local=localParts(now,timezone);
    const result=await env.DB.prepare(`
      UPDATE medication_reminder_events
      SET status='expired',updated_at=?
      WHERE status='due'
        AND timezone=?
        AND scheduled_date<?
    `).bind(updatedAt,storedTimezone,local.date).run();
    expired+=Number(result?.meta?.changes||0);
  }

  return expired;
}

export async function runMedicationReminderScheduler(env,scheduledAt=new Date()){
  if(!env?.DB)return {ok:false,error:'DB binding unavailable',generated:0,repaired:0,expired:0,checked:0,failed:0};

  const now=scheduledAt instanceof Date?scheduledAt:new Date(scheduledAt);
  if(Number.isNaN(now.getTime()))return {ok:false,error:'Invalid scheduler timestamp',generated:0,repaired:0,expired:0,checked:0,failed:0};

  let repaired=0;
  let expired=0;
  const maintenanceErrors=[];

  // Maintenance must never prevent new reminders from being generated.
  try{
    repaired=await repairPrematureExpiredEvents(env,now);
  }catch(error){
    maintenanceErrors.push('repair');
    console.error('Medication reminder repair failed',error);
  }

  try{
    expired=await expireStaleDueEvents(env,now);
  }catch(error){
    maintenanceErrors.push('expiry');
    console.error('Medication reminder expiry failed',error);
  }

  const rows=await env.DB.prepare(`
    SELECT s.id AS schedule_id,s.member_user_id,s.medication_id,s.time_local,s.days_of_week,s.timezone
    FROM medication_schedules s
    JOIN member_medications m ON m.id=s.medication_id AND m.member_user_id=s.member_user_id
    JOIN users u ON u.id=s.member_user_id
    WHERE s.active=1
      AND m.active=1
      AND u.account_type='member'
      AND u.status='active'
    ORDER BY s.member_user_id,s.time_local
    LIMIT 5000
  `).all();

  const generatedAt=now.toISOString();
  let generated=0;
  let checked=0;
  let failed=0;

  for(const row of rows.results||[]){
    checked+=1;
    try{
      const timezone=normalizedTimeZone(row.timezone);
      const local=localParts(now,timezone);
      if(!scheduleApplies(row.days_of_week,local.weekday))continue;

      // A delayed cron run may still create today's reminder after its scheduled minute.
      // The unique constraint keeps this idempotent, and a recorded dose suppresses creation.
      if(String(row.time_local||'')>local.time)continue;

      const id=`REM-${crypto.randomUUID()}`;
      const result=await env.DB.prepare(`
        INSERT OR IGNORE INTO medication_reminder_events (
          id,member_user_id,medication_id,schedule_id,scheduled_date,scheduled_time_local,
          timezone,status,generated_at,created_at,updated_at
        )
        SELECT ?,?,?,?,?,?,?,'due',?,?,?
        WHERE NOT EXISTS (
          SELECT 1
          FROM medication_dose_records r
          WHERE r.member_user_id=?
            AND r.schedule_id=?
            AND r.scheduled_date=?
        )
      `).bind(
        id,row.member_user_id,row.medication_id,row.schedule_id,local.date,row.time_local,
        timezone,generatedAt,generatedAt,generatedAt,
        row.member_user_id,row.schedule_id,local.date
      ).run();

      if(Number(result?.meta?.changes||0)===1)generated+=1;
    }catch(error){
      failed+=1;
      console.error('Medication reminder generation failed',{
        scheduleId:row.schedule_id,
        medicationId:row.medication_id,
        memberUserId:row.member_user_id,
        timeLocal:row.time_local,
        timezone:row.timezone,
        error
      });
    }
  }

  return {
    ok:true,
    generated,
    repaired,
    expired,
    checked,
    failed,
    maintenanceErrors,
    ranAt:generatedAt
  };
}
