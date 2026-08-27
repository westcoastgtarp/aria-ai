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
  if(!env?.DB)return {ok:false,error:'DB binding unavailable',generated:0,expired:0,checked:0};

  const now=scheduledAt instanceof Date?scheduledAt:new Date(scheduledAt);
  if(Number.isNaN(now.getTime()))return {ok:false,error:'Invalid scheduler timestamp',generated:0,expired:0,checked:0};

  // A medication reminder stays Due for the full local calendar day. Once that
  // reminder's local date has passed without a recorded dose, preserve the event
  // but close it as expired. The member UI presents this as "Not recorded" so
  // Aria never implies that the medication was skipped or taken.
  const expired=await expireStaleDueEvents(env,now);

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

  for(const row of rows.results||[]){
    checked+=1;
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
  }

  return {ok:true,generated,expired,checked,ranAt:generatedAt};
}
