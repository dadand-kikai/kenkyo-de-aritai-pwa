CREATE TABLE IF NOT EXISTS notification_subscriptions (
  device_id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  onesignal_subscription_id TEXT NOT NULL UNIQUE,
  timezone TEXT NOT NULL,
  minute_of_day INTEGER NOT NULL CHECK (minute_of_day >= 0 AND minute_of_day < 1440),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  next_due INTEGER NOT NULL,
  last_sent_local_date TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_due
ON notification_subscriptions (enabled, next_due);
