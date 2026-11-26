-- Granize application data is private; the browser never receives a database credential.

CREATE SCHEMA granize;

REVOKE ALL ON SCHEMA granize FROM PUBLIC, anon, authenticated;

CREATE ROLE granize_backend LOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION;

SET LOCAL search_path = granize, pg_catalog;

CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', avatar_key TEXT, birth_date TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT 'Brasil', currency TEXT NOT NULL DEFAULT 'BRL', financial_goal TEXT NOT NULL DEFAULT '', preferred_summary_day INTEGER NOT NULL DEFAULT 1, password_hash TEXT, password_salt TEXT, google_sub TEXT UNIQUE, monthly_budget_cents BIGINT NOT NULL DEFAULT 0, email_notifications INTEGER NOT NULL DEFAULT 0, browser_notifications INTEGER NOT NULL DEFAULT 1, onboarding_completed INTEGER NOT NULL DEFAULT 0, profile_completed INTEGER NOT NULL DEFAULT 0, terms_accepted_at TEXT, privacy_accepted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, description TEXT NOT NULL, amount_cents BIGINT NOT NULL, transaction_date TEXT NOT NULL, transaction_time TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', external_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'payment', amount_cents BIGINT, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS whatsapp_connections (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, instance_name TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'disconnected', phone TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS whatsapp_bot_connections (id TEXT PRIMARY KEY NOT NULL DEFAULT 'primary', instance_name TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'disconnected', phone TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS whatsapp_user_links (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, phone TEXT NOT NULL UNIQUE, verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS whatsapp_link_tokens (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS subscriptions (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL DEFAULT 'stripe', plan TEXT NOT NULL DEFAULT 'none', status TEXT NOT NULL DEFAULT 'inactive', customer_id TEXT, subscription_id TEXT, checkout_session_id TEXT, current_period_end TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, event_type TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS billing_checkouts (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'creating', session_id TEXT UNIQUE, checkout_url TEXT, subscription_id TEXT, expires_at BIGINT NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_checkout_pending ON billing_checkouts(user_id, mode) WHERE status IN ('creating', 'open', 'processing');

CREATE TABLE IF NOT EXISTS shopping_items (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, normalized_name TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', completed_at TEXT, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS shopping_events (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, message_id TEXT NOT NULL, response_text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, message_id));

CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_user_name ON shopping_items(user_id, normalized_name);

CREATE INDEX IF NOT EXISTS idx_shopping_user_pending ON shopping_items(user_id, deleted_at, completed_at);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_external ON transactions(user_id, external_id);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_reminders_user_due ON reminders(user_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_whatsapp_link_tokens_user ON whatsapp_link_tokens(user_id, expires_at);

ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;

ALTER TABLE subscriptions ADD COLUMN stripe_mode TEXT;

ALTER TABLE subscriptions ADD COLUMN stripe_event_created BIGINT NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX idx_users_google_sub ON users(google_sub);

CREATE INDEX idx_subscriptions_subscription ON subscriptions(subscription_id);

CREATE INDEX idx_billing_checkouts_user ON billing_checkouts(user_id);

CREATE TABLE auth_attempts (key TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, expires_at BIGINT NOT NULL);

CREATE INDEX idx_auth_attempts_expires ON auth_attempts(expires_at);

GRANT USAGE ON SCHEMA granize TO granize_backend;

ALTER TABLE granize.users ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.users FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.users TO granize_backend;

CREATE POLICY backend_access ON granize.users FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.transactions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.transactions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.transactions TO granize_backend;

CREATE POLICY backend_access ON granize.transactions FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.sessions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.sessions TO granize_backend;

CREATE POLICY backend_access ON granize.sessions FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.reminders ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.reminders FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.reminders TO granize_backend;

CREATE POLICY backend_access ON granize.reminders FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.whatsapp_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.whatsapp_connections FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.whatsapp_connections TO granize_backend;

CREATE POLICY backend_access ON granize.whatsapp_connections FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.whatsapp_bot_connections ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.whatsapp_bot_connections FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.whatsapp_bot_connections TO granize_backend;

CREATE POLICY backend_access ON granize.whatsapp_bot_connections FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.whatsapp_user_links ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.whatsapp_user_links FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.whatsapp_user_links TO granize_backend;

CREATE POLICY backend_access ON granize.whatsapp_user_links FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.whatsapp_link_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.whatsapp_link_tokens FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.whatsapp_link_tokens TO granize_backend;

CREATE POLICY backend_access ON granize.whatsapp_link_tokens FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.subscriptions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.subscriptions FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.subscriptions TO granize_backend;

CREATE POLICY backend_access ON granize.subscriptions FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.webhook_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.webhook_events TO granize_backend;

CREATE POLICY backend_access ON granize.webhook_events FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.billing_checkouts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.billing_checkouts FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.billing_checkouts TO granize_backend;

CREATE POLICY backend_access ON granize.billing_checkouts FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.shopping_items ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.shopping_items FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.shopping_items TO granize_backend;

CREATE POLICY backend_access ON granize.shopping_items FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.shopping_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.shopping_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.shopping_events TO granize_backend;

CREATE POLICY backend_access ON granize.shopping_events FOR ALL TO granize_backend USING (true) WITH CHECK (true);

ALTER TABLE granize.auth_attempts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE granize.auth_attempts FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE granize.auth_attempts TO granize_backend;

CREATE POLICY backend_access ON granize.auth_attempts FOR ALL TO granize_backend USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('granize-profile-images', 'granize-profile-images', false, 2097152, ARRAY['image/jpeg','image/png','image/webp']);
