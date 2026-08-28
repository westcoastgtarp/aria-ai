function minuteWindow(date=new Date()){
  const d=new Date(date);
  d.setUTCSeconds(0,0);
  return d.toISOString();
}

export async function consumeAiRateLimit(env,{userId,scope,limit,now=new Date()}={}){
  if(!env?.DB||!userId||!scope||!Number.isFinite(limit)||limit<1){
    return {allowed:true,count:0,limit,retryAfterSeconds:0};
  }

  const windowStart=minuteWindow(now);
  const updatedAt=new Date(now).toISOString();

  await env.DB.prepare(`
    INSERT INTO ai_request_rate_limits (user_id,scope,window_start,request_count,updated_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(user_id,scope,window_start)
    DO UPDATE SET request_count=request_count+1,updated_at=excluded.updated_at
  `).bind(userId,scope,windowStart,1,updatedAt).run();

  const row=await env.DB.prepare(`
    SELECT request_count
    FROM ai_request_rate_limits
    WHERE user_id=? AND scope=? AND window_start=?
    LIMIT 1
  `).bind(userId,scope,windowStart).first();

  const count=Number(row?.request_count||0);
  const elapsed=Math.max(0,Math.floor((new Date(now).getTime()-new Date(windowStart).getTime())/1000));
  const retryAfterSeconds=Math.max(1,60-elapsed);
  return {allowed:count<=limit,count,limit,retryAfterSeconds};
}
