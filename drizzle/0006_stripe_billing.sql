ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN stripe_mode TEXT;
--> statement-breakpoint
ALTER TABLE subscriptions ADD COLUMN stripe_event_created INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS billing_checkouts (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL,
  mode TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'creating',
  session_id TEXT UNIQUE,
  checkout_url TEXT,
  subscription_id TEXT,
  expires_at INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_checkout_pending ON billing_checkouts(user_id, mode) WHERE status IN ('creating', 'open', 'processing');
