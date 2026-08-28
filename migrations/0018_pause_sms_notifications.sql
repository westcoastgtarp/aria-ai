PRAGMA foreign_keys = ON;

UPDATE member_notification_preferences
SET sms_enabled=0,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE sms_enabled<>0;

UPDATE communication_deliveries
SET status='cancelled',
    next_attempt_at=NULL,
    updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE channel='sms'
  AND status IN ('pending','retrying','sending');
