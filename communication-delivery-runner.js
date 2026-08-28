import { EmailMessage } from 'cloudflare:email';
import {
  beginCommunicationAttempt,
  listRetryableCommunicationDeliveries,
  markCommunicationFailed,
  markCommunicationSent
} from './communication-delivery-service.js';

const PRIVATE_REMINDER_TEXT='Aria: You have a reminder. Sign in to Aria to view it.';
const EMAIL_SUBJECT='You have an Aria reminder';

function clean(value){return String(value??'').trim();}

async function deliveryDestination(env,row){
  if(row.recipient_type!=='member')return null;

  if(row.channel==='email'){
    const member=await env.DB.prepare(`
      SELECT email
      FROM users
      WHERE id=? AND account_type='member' AND status='active'
      LIMIT 1
    `).bind(row.recipient_id).first();
    const email=clean(member?.email);
    return email?{address:email}:null;
  }

  if(row.channel==='sms'){
    const member=await env.DB.prepare(`
      SELECT p.sms_phone_e164
      FROM users u
      JOIN member_notification_preferences p ON p.member_user_id=u.id
      WHERE u.id=?
        AND u.account_type='member'
        AND u.status='active'
        AND p.sms_enabled=1
      LIMIT 1
    `).bind(row.recipient_id).first();
    const phone=clean(member?.sms_phone_e164);
    return phone?{address:phone}:null;
  }

  return null;
}

async function medicationReminderDeliveryState(env,row,now){
  if(row.source_type!=='medication_reminder')return {action:'send'};

  const event=await env.DB.prepare(`
    SELECT e.status,e.snoozed_until,r.id AS dose_record_id
    FROM medication_reminder_events e
    LEFT JOIN medication_dose_records r
      ON r.member_user_id=e.member_user_id
      AND r.schedule_id=e.schedule_id
      AND r.scheduled_date=e.scheduled_date
    WHERE e.id=? AND e.member_user_id=?
    LIMIT 1
  `).bind(row.source_id,row.recipient_id).first();

  if(!event)return {action:'cancel',reason:'source_unavailable'};
  if(event.dose_record_id)return {action:'cancel',reason:'dose_recorded'};
  if(event.status!=='due')return {action:'cancel',reason:`reminder_${clean(event.status)||'inactive'}`};

  const snoozedUntil=clean(event.snoozed_until);
  if(snoozedUntil){
    const snoozedMs=Date.parse(snoozedUntil);
    if(Number.isFinite(snoozedMs)&&snoozedMs>now.getTime()){
      return {action:'wait',reason:'reminder_snoozed'};
    }
  }

  return {action:'send'};
}

async function cancelDelivery(env,id,reason){
  const now=new Date().toISOString();
  await env.DB.prepare(`
    UPDATE communication_deliveries
    SET status='cancelled',next_attempt_at=NULL,last_error_code=NULL,last_error_message=?,updated_at=?
    WHERE id=? AND status IN ('pending','retrying')
  `).bind(clean(reason)||'Delivery no longer applicable',now,id).run();
}

function emailConfigured(env){
  return Boolean(env?.EMAIL&&clean(env.ARIA_EMAIL_FROM));
}

function smsConfigured(env){
  const provider=clean(env.SMS_PROVIDER).toLowerCase();
  if(provider!=='twilio')return false;
  return Boolean(
    clean(env.TWILIO_ACCOUNT_SID)&&
    clean(env.TWILIO_AUTH_TOKEN)&&
    clean(env.TWILIO_FROM_NUMBER)
  );
}

async function sendEmail(env,to){
  const from=clean(env.ARIA_EMAIL_FROM);
  const raw=[
    `From: Aria <${from}>`,
    `To: ${to}`,
    `Subject: ${EMAIL_SUBJECT}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    PRIVATE_REMINDER_TEXT,
    ''
  ].join('\r\n');

  await env.EMAIL.send(new EmailMessage(from,to,raw));
  return {provider:'cloudflare-email',providerMessageId:null};
}

async function sendTwilioSms(env,to){
  const accountSid=clean(env.TWILIO_ACCOUNT_SID);
  const authToken=clean(env.TWILIO_AUTH_TOKEN);
  const from=clean(env.TWILIO_FROM_NUMBER);
  const form=new URLSearchParams({To:to,From:from,Body:PRIVATE_REMINDER_TEXT});
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`,{
    method:'POST',
    headers:{
      authorization:`Basic ${btoa(`${accountSid}:${authToken}`)}`,
      'content-type':'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body:form.toString()
  });

  let data={};
  try{data=await response.json();}catch{}
  if(!response.ok){
    const error=new Error(clean(data?.message)||`SMS provider returned ${response.status}`);
    error.code=clean(data?.code)||`HTTP_${response.status}`;
    throw error;
  }

  return {provider:'twilio',providerMessageId:clean(data?.sid)||null};
}

function channelReady(env,channel){
  if(channel==='email')return emailConfigured(env);
  if(channel==='sms')return smsConfigured(env);
  return false;
}

async function sendDelivery(env,row,now){
  const sourceState=await medicationReminderDeliveryState(env,row,now);
  if(sourceState.action==='cancel'){
    await cancelDelivery(env,row.id,sourceState.reason);
    return {cancelled:true,reason:sourceState.reason};
  }
  if(sourceState.action==='wait'){
    return {skipped:true,reason:sourceState.reason};
  }

  const destination=await deliveryDestination(env,row);
  if(!destination?.address){
    return {skipped:true,reason:'destination_unavailable'};
  }

  if(!channelReady(env,row.channel)){
    return {skipped:true,reason:'provider_not_configured'};
  }

  const provider=row.channel==='email'?'cloudflare-email':'twilio';
  await beginCommunicationAttempt(env,row.id,{provider});

  try{
    const result=row.channel==='email'
      ?await sendEmail(env,destination.address)
      :await sendTwilioSms(env,destination.address);
    await markCommunicationSent(env,row.id,result);
    return {sent:true,channel:row.channel};
  }catch(error){
    await markCommunicationFailed(env,row.id,{
      errorCode:clean(error?.code)||'DELIVERY_FAILED',
      errorMessage:clean(error?.message)||'Delivery failed',
      retryAfterMinutes:5
    });
    return {failed:true,channel:row.channel,error:clean(error?.message)};
  }
}

export async function runCommunicationDeliveries(env,now=new Date()){
  if(!env?.DB)return {ok:false,error:'DB binding unavailable',checked:0,sent:0,failed:0,skipped:0,cancelled:0};

  const runAt=now instanceof Date?now:new Date(now);
  const safeNow=Number.isNaN(runAt.getTime())?new Date():runAt;
  const rows=await listRetryableCommunicationDeliveries(env,safeNow,100);
  let sent=0;
  let failed=0;
  let skipped=0;
  let cancelled=0;
  const skippedReasons={};

  for(const row of rows){
    try{
      const result=await sendDelivery(env,row,safeNow);
      if(result.sent)sent+=1;
      else if(result.failed)failed+=1;
      else if(result.cancelled)cancelled+=1;
      else if(result.skipped){
        skipped+=1;
        skippedReasons[result.reason]=(skippedReasons[result.reason]||0)+1;
      }
    }catch(error){
      failed+=1;
      console.error('Communication delivery runner failed',{
        deliveryId:row.id,
        channel:row.channel,
        error
      });
    }
  }

  return {ok:true,checked:rows.length,sent,failed,skipped,cancelled,skippedReasons,ranAt:new Date().toISOString()};
}
