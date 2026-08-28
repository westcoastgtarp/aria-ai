import { ensureCommunicationDelivery } from './communication-delivery-service.js';

async function memberNotificationSettings(env,memberUserId){
  const row=await env.DB.prepare(`
    SELECT
      u.email,
      COALESCE(p.email_enabled,1) AS email_enabled,
      COALESCE(p.sms_enabled,1) AS sms_enabled,
      p.sms_phone_e164,
      COALESCE(p.private_content,1) AS private_content
    FROM users u
    LEFT JOIN member_notification_preferences p ON p.member_user_id=u.id
    WHERE u.id=? AND u.account_type='member' AND u.status='active'
    LIMIT 1
  `).bind(memberUserId).first();
  return row||null;
}

export async function queueMedicationReminderDeliveries(env,{eventId,memberUserId}={}){
  if(!env?.DB)throw new Error('DB binding unavailable');
  if(!eventId||!memberUserId)return {email:false,sms:false};

  const settings=await memberNotificationSettings(env,memberUserId);
  if(!settings)return {email:false,sms:false};

  let email=false;
  let sms=false;

  if(Number(settings.email_enabled)===1&&String(settings.email||'').trim()){
    await ensureCommunicationDelivery(env,{
      recipientType:'member',
      recipientId:memberUserId,
      sourceType:'medication_reminder',
      sourceId:eventId,
      channel:'email',
      purpose:'medication_reminder',
      maxAttempts:3
    });
    email=true;
  }

  // SMS is part of the free tier, but a delivery is only queued once the member
  // has supplied a usable mobile number. Missing contact data is not treated as
  // a delivery failure.
  if(Number(settings.sms_enabled)===1&&String(settings.sms_phone_e164||'').trim()){
    await ensureCommunicationDelivery(env,{
      recipientType:'member',
      recipientId:memberUserId,
      sourceType:'medication_reminder',
      sourceId:eventId,
      channel:'sms',
      purpose:'medication_reminder',
      maxAttempts:3
    });
    sms=true;
  }

  return {email,sms};
}
