import { ensureCommunicationDelivery } from './communication-delivery-service.js';

async function memberNotificationSettings(env,memberUserId){
  const row=await env.DB.prepare(`
    SELECT
      u.email,
      COALESCE(p.email_enabled,1) AS email_enabled,
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

  // SMS and voice are intentionally paused. Keep the provider-neutral delivery
  // architecture in place, but do not create new jobs until those channels are
  // explicitly enabled again.
  return {email,sms:false};
}
