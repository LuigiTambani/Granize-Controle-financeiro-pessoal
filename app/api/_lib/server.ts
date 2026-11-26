import { env } from "./environment";
import { postgresDatabase, type Database } from "./database";
import { profileStorage, type ProfileStorage } from "./storage";

type RuntimeEnv = Record<string, unknown> & { DB?: Database; PROFILE_IMAGES?: ProfileStorage };

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
};

const LOCAL_COOKIE = "granize_session";
let schemaReady: Promise<void> | null = null;

export function runtimeString(name: string): string {
  const value = (env as unknown as RuntimeEnv)[name];
  return typeof value === "string" ? value.trim() : "";
}

export function getD1(): Database {
  const db = (env as unknown as RuntimeEnv).DB;
  return db || postgresDatabase();
}

export function getProfileImages(): ProfileStorage {
  const bucket = (env as unknown as RuntimeEnv).PROFILE_IMAGES;
  return bucket || profileStorage();
}

export function isLocalRequest(request: Request) {
  const hostname = new URL(request.url).hostname;
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function readCookie(request: Request, name: string) {
  const value = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : "";
}

export function hasAppSession(request: Request) {
  return Boolean(readCookie(request, LOCAL_COOKIE));
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string) {
  return toHex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}

export function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

export function sessionCookie(token: string, request: Request, maxAge = 60 * 60 * 24 * 30) {
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return `${LOCAL_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export async function ensureSchema() {
  // Hosted deployments apply versioned migrations before serving requests.
  if (!(env as RuntimeEnv).DB || runtimeString("GRANIZE_MANAGED_SCHEMA") === "true") return;
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    const db = getD1();
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', avatar_key TEXT, birth_date TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT 'Brasil', currency TEXT NOT NULL DEFAULT 'BRL', financial_goal TEXT NOT NULL DEFAULT '', preferred_summary_day INTEGER NOT NULL DEFAULT 1, password_hash TEXT, password_salt TEXT, google_sub TEXT UNIQUE, monthly_budget_cents INTEGER NOT NULL DEFAULT 0, email_notifications INTEGER NOT NULL DEFAULT 0, browser_notifications INTEGER NOT NULL DEFAULT 1, onboarding_completed INTEGER NOT NULL DEFAULT 0, profile_completed INTEGER NOT NULL DEFAULT 0, terms_accepted_at TEXT, privacy_accepted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS transactions (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, type TEXT NOT NULL, description TEXT NOT NULL, amount_cents INTEGER NOT NULL, transaction_date TEXT NOT NULL, transaction_time TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'manual', external_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS reminders (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', kind TEXT NOT NULL DEFAULT 'payment', amount_cents INTEGER, due_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS whatsapp_connections (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, instance_name TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'disconnected', phone TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS whatsapp_bot_connections (id TEXT PRIMARY KEY NOT NULL DEFAULT 'primary', instance_name TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'disconnected', phone TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS whatsapp_user_links (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, phone TEXT NOT NULL UNIQUE, verified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS whatsapp_link_tokens (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS subscriptions (user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL DEFAULT 'stripe', plan TEXT NOT NULL DEFAULT 'none', status TEXT NOT NULL DEFAULT 'inactive', customer_id TEXT, subscription_id TEXT, checkout_session_id TEXT, current_period_end TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, event_type TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS billing_checkouts (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, plan TEXT NOT NULL, mode TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'creating', session_id TEXT UNIQUE, checkout_url TEXT, subscription_id TEXT, expires_at INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_checkout_pending ON billing_checkouts(user_id, mode) WHERE status IN ('creating', 'open', 'processing')`,
      `CREATE TABLE IF NOT EXISTS shopping_items (id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, normalized_name TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', completed_at TEXT, deleted_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS shopping_events (user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, message_id TEXT NOT NULL, response_text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, message_id))`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_shopping_user_name ON shopping_items(user_id, normalized_name)`,
      `CREATE INDEX IF NOT EXISTS idx_shopping_user_pending ON shopping_items(user_id, deleted_at, completed_at)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, transaction_date)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_user_external ON transactions(user_id, external_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_reminders_user_due ON reminders(user_id, status, due_date)`,
      `CREATE INDEX IF NOT EXISTS idx_whatsapp_link_tokens_user ON whatsapp_link_tokens(user_id, expires_at)`,
    ];
    for (const statement of statements) await db.prepare(statement).run();
    const additions = [
      "ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN password_hash TEXT",
      "ALTER TABLE users ADD COLUMN password_salt TEXT",
      "ALTER TABLE users ADD COLUMN google_sub TEXT",
      "ALTER TABLE users ADD COLUMN monthly_budget_cents INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE users ADD COLUMN email_notifications INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE users ADD COLUMN browser_notifications INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE users ADD COLUMN avatar_key TEXT",
      "ALTER TABLE users ADD COLUMN birth_date TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN country TEXT NOT NULL DEFAULT 'Brasil'",
      "ALTER TABLE users ADD COLUMN currency TEXT NOT NULL DEFAULT 'BRL'",
      "ALTER TABLE users ADD COLUMN financial_goal TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE users ADD COLUMN preferred_summary_day INTEGER NOT NULL DEFAULT 1",
      "ALTER TABLE users ADD COLUMN profile_completed INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE users ADD COLUMN terms_accepted_at TEXT",
      "ALTER TABLE users ADD COLUMN privacy_accepted_at TEXT",
      "ALTER TABLE transactions ADD COLUMN transaction_time TEXT NOT NULL DEFAULT ''",
      "ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE subscriptions ADD COLUMN stripe_mode TEXT",
      "ALTER TABLE subscriptions ADD COLUMN stripe_event_created INTEGER NOT NULL DEFAULT 0",
    ];
    for (const statement of additions) {
      try { await db.prepare(statement).run(); } catch (error) {
        if (!(error instanceof Error) || !/duplicate column/i.test(error.message)) throw error;
      }
    }
    await db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_sub ON users(google_sub)").run();
    await db.prepare(`
      INSERT INTO whatsapp_bot_connections (id, instance_name, status, phone)
      SELECT 'primary', instance_name, status, phone FROM whatsapp_connections
      ORDER BY created_at ASC LIMIT 1
      ON CONFLICT(id) DO NOTHING
    `).run();
  })().catch((error) => { schemaReady = null; throw error; });
  return schemaReady;
}

export async function getRequestUser(request: Request): Promise<SessionUser | null> {
  return getAppSessionUser(request);
}

export async function getAppSessionUser(request: Request): Promise<SessionUser | null> {
  const token = readCookie(request, LOCAL_COOKIE);
  if (!token) return null;
  await ensureSchema();
  const row = await getD1().prepare(`
    SELECT users.id, users.email, users.full_name AS fullName, sessions.expires_at AS expiresAt
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
  `).bind(await sha256(token)).first<SessionUser & { expiresAt: string }>();
  return row && Date.parse(row.expiresAt) > Date.now() ? { id: row.id, email: row.email, fullName: row.fullName } : null;
}

export async function requireApiUser(request: Request): Promise<SessionUser> {
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) requireSameOrigin(request);
  const user = await getRequestUser(request);
  if (!user) throw new ApiError(401, "Entre para continuar.");
  await ensureUser(user);
  return user;
}

export async function ensureUser(user: SessionUser) {
  await ensureSchema();
  const db = getD1();
  await db.prepare(`
    INSERT INTO users (id, email, full_name, onboarding_completed, created_at, updated_at)
    VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      email = excluded.email,
      full_name = CASE WHEN users.full_name = '' THEN excluded.full_name ELSE users.full_name END,
      updated_at = CURRENT_TIMESTAMP
  `).bind(user.id, user.email, user.fullName).run();
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const host = request.headers.get("host");
  let loopbackOrigin = "";
  if (host && isLocalRequest(request)) {
    try {
      const forwarded = new URL(`${url.protocol}//${host}`);
      if (["localhost", "127.0.0.1", "[::1]"].includes(forwarded.hostname) && forwarded.port === url.port) loopbackOrigin = forwarded.origin;
    } catch { /* An invalid Host never grants access. */ }
  }
  if (origin && origin !== url.origin && origin !== runtimeString("APP_URL").replace(/\/$/, "") && origin !== loopbackOrigin) {
    throw new ApiError(403, "Origem da solicitação não autorizada.");
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Request failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: "Não foi possível concluir a solicitação. Tente novamente em instantes." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
}

export function publicOrigin(request: Request) {
  return new URL(runtimeString("APP_URL") || request.url).origin;
}

export function normalizeEvolutionUrl(url: string) {
  return url.replace(/\/+$/, "");
}
