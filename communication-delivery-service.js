const ALLOWED_RECIPIENT_TYPES=new Set(['member','staff','care_contact']);
const ALLOWED_SOURCE_TYPES=new Set(['medication_reminder','custom_reminder','lifeline','support','account']);
const ALLOWED_CHANNELS=new Set(['email','sms','voice']);
const FINAL_STATUSES=new Set(['delivered','cancelled']);

function clean(value,max=160){return String(value??'').trim().slice(0,max);}
function positiveInt(value,fallback){const parsed=Number(value);return Number.isInteger(parsed)&&parsed>0?parsed:fallback;}

export async function ensureCommunicationDelivery(env,input={}){
  if(!env?.DB)throw new Error('DB binding unavailable');
  const recipientType=clean(input.recipientType,40);
  const recipientId=clean(input.recipientId,180);
  const sourceType=clean(input.sourceType,60);
  const sourceId=clean(input.sourceId,180);
  const channel=clean(input.channel,20);
  const purpose=clean(input.purpose,120);
  const maxAttempts=positiveInt(input.maxAttempts,3);
  if(!ALLOWED_RECIPIENT_TYPES.has(recipientType))throw new Error('Invalid communication recipient type');
  if(!recipientId)throw new Error('Communication recipient is required');
  if(!ALLOWED_SOURCE_TYPES.has(sourceType))throw new Error('Invalid communication source type');
  if(!sourceId)throw new Error('Communication source is required');
  if(!ALLOWED_CHANNELS.has(channel))throw new Error('Invalid communication channel');
  if(!purpose)throw new Error('Communication purpose is required');

  const now=new Date().toISOString();
  const id=`DLV-${crypto.randomUUID()}`;
  await env.DB.prepare(`
    INSERT OR IGNORE INTO communication_deliveries
      (id,recipient_type,recipient_id,source_type,source_id,channel,purpose,status,max_attempts,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'pending',?,?,?)
  `).bind(id,recipientType,recipientId,sourceType,sourceId,channel,purpose,maxAttempts,now,now).run();

  return env.DB.prepare(`
    SELECT * FROM communication_deliveries
    WHERE source_type=? AND source_id=? AND recipient_type=? AND recipient_id=? AND channel=?
    LIMIT 1
  `).bind(sourceType,sourceId,recipientType,recipientId,channel).first();
}

export async function beginCommunicationAttempt(env,id,{provider=null}={}){
  const now=new Date().toISOString();
  const row=await env.DB.prepare(`SELECT * FROM communication_deliveries WHERE id=? LIMIT 1`).bind(id).first();
  if(!row)throw new Error('Communication delivery not found');
  if(FINAL_STATUSES.has(row.status))return row;
  if(Number(row.attempt_count||0)>=Number(row.max_attempts||3))return row;
  await env.DB.prepare(`
    UPDATE communication_deliveries
    SET status='sending',provider=?,attempt_count=attempt_count+1,last_attempt_at=?,next_attempt_at=NULL,
        last_error_code=NULL,last_error_message=NULL,updated_at=?
    WHERE id=?
  `).bind(provider?clean(provider,60):null,now,now,id).run();
  return env.DB.prepare(`SELECT * FROM communication_deliveries WHERE id=?`).bind(id).first();
}

export async function markCommunicationSent(env,id,{provider=null,providerMessageId=null}={}){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    UPDATE communication_deliveries
    SET status='sent',provider=COALESCE(?,provider),provider_message_id=COALESCE(?,provider_message_id),
        sent_at=COALESCE(sent_at,?),failed_at=NULL,next_attempt_at=NULL,last_error_code=NULL,last_error_message=NULL,updated_at=?
    WHERE id=?
  `).bind(provider?clean(provider,60):null,providerMessageId?clean(providerMessageId,200):null,now,now,id).run();
}

export async function markCommunicationDelivered(env,id){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    UPDATE communication_deliveries
    SET status='delivered',delivered_at=COALESCE(delivered_at,?),failed_at=NULL,next_attempt_at=NULL,updated_at=?
    WHERE id=?
  `).bind(now,now,id).run();
}

export async function markCommunicationFailed(env,id,{errorCode=null,errorMessage=null,retryAfterMinutes=5}={}){
  const row=await env.DB.prepare(`SELECT attempt_count,max_attempts FROM communication_deliveries WHERE id=? LIMIT 1`).bind(id).first();
  if(!row)throw new Error('Communication delivery not found');
  const now=new Date();
  const exhausted=Number(row.attempt_count||0)>=Number(row.max_attempts||3);
  const nextAttemptAt=exhausted?null:new Date(now.getTime()+(positiveInt(retryAfterMinutes,5)*60000)).toISOString();
  const status=exhausted?'failed':'retrying';
  await env.DB.prepare(`
    UPDATE communication_deliveries
    SET status=?,failed_at=?,next_attempt_at=?,last_error_code=?,last_error_message=?,updated_at=?
    WHERE id=?
  `).bind(status,now.toISOString(),nextAttemptAt,errorCode?clean(errorCode,120):null,errorMessage?clean(errorMessage,500):null,now.toISOString(),id).run();
}

export async function listRetryableCommunicationDeliveries(env,now=new Date(),limit=100){
  const timestamp=(now instanceof Date?now:new Date(now)).toISOString();
  const safeLimit=Math.min(500,Math.max(1,positiveInt(limit,100)));
  const rows=await env.DB.prepare(`
    SELECT * FROM communication_deliveries
    WHERE status IN ('pending','retrying')
      AND attempt_count < max_attempts
      AND (next_attempt_at IS NULL OR next_attempt_at<=?)
    ORDER BY created_at ASC
    LIMIT ?
  `).bind(timestamp,safeLimit).all();
  return rows.results||[];
}
