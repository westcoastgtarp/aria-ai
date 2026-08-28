function safe(value,max=120){return String(value||'').trim().slice(0,max);}

export async function recordAiOperationalAudit(env,{
  userId,
  eventType,
  scope,
  code=null,
  count=null,
  limit=null,
  fallback=null
}={}){
  if(!env?.DB||!userId||!eventType)return {recorded:false};
  const now=new Date().toISOString();
  const details={scope:safe(scope,80)};
  if(code)details.code=safe(code,80);
  if(Number.isFinite(Number(count)))details.count=Number(count);
  if(Number.isFinite(Number(limit)))details.limit=Number(limit);
  if(fallback)details.fallback=safe(fallback,120);

  await env.DB.prepare(`
    INSERT INTO audit_events
    (id,category,event_type,actor_user_id,subject_type,subject_id,details_json,occurred_at,recorded_at)
    VALUES (?, 'AI Operations', ?, ?, 'member', ?, ?, ?, ?)
  `).bind(
    `AUD-${crypto.randomUUID()}`,
    safe(eventType,120),
    userId,
    userId,
    JSON.stringify(details),
    now,
    now
  ).run();
  return {recorded:true};
}
