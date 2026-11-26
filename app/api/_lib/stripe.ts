import { ApiError, ensureSchema, ensureUser, getAppSessionUser, getD1, isLocalRequest, runtimeString } from "./server";
import { effectiveSubscription, isPaidPlan, paidPlans, type BillingStatus, type SubscriptionRecord } from "../../lib/billing";

export const STRIPE_API_VERSION = "2025-06-30.basil";
type StripeObject = Record<string, unknown>;
export type CheckoutAttempt = { id: string; userId: string; plan: string; mode: string; status: string; sessionId: string | null; checkoutUrl: string | null; expiresAt: number; createdAt: string };
export type VerifiedEvent = { id: string; type: string; created: number; livemode: boolean; data: { object: StripeObject } };
const attemptFields = "id, user_id AS userId, plan, mode, status, session_id AS sessionId, checkout_url AS checkoutUrl, expires_at AS expiresAt, created_at AS createdAt";
export function stripeMode(): "test" | "live" { return runtimeString("STRIPE_MODE") === "live" ? "live" : "test"; }
export function stripeConfigured() {
  const mode = runtimeString("STRIPE_MODE") || "test";
  const key = runtimeString("STRIPE_SECRET_KEY");
  return ["test", "live"].includes(mode) && new RegExp(`^(sk|rk)_${mode}_[a-zA-Z0-9]+$`).test(key) && runtimeString("STRIPE_WEBHOOK_SECRET").startsWith("whsec_");
}
export function requireStripeConfig() {
  if (!stripeConfigured()) throw new ApiError(503, "Os pagamentos ainda estão sendo configurados. O plano Grátis continua disponível.");
}
export function billingOrigin(request: Request) {
  const configured = runtimeString("APP_URL");
  let url: URL;
  try { url = new URL(configured || (isLocalRequest(request) ? request.url : "")); }
  catch { throw new ApiError(503, "O endereço de retorno do pagamento ainda não foi configurado."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || !["https:", "http:"].includes(url.protocol) || (url.protocol !== "https:" && !local)
    || (stripeMode() === "live" && (local || url.protocol !== "https:" || !configured))) throw new ApiError(503, "Configure o endereço HTTPS da Granize antes de ativar cobranças reais.");
  return url.origin;
}
export async function requireBillingUser(request: Request) {
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin && origin !== new URL(request.url).origin && origin !== runtimeString("APP_URL").replace(/\/$/, "")) throw new ApiError(403, "Origem de pagamento não autorizada.");
  const user = await getAppSessionUser(request);
  if (!user) throw new ApiError(401, "Entre na sua conta para gerenciar pagamentos.");
  await ensureUser(user);
  return user;
}
export function stripeId(value: unknown): string {
  return typeof value === "string" ? value : value && typeof value === "object" && typeof (value as StripeObject).id === "string" ? (value as { id: string }).id : "";
}
function object(value: unknown): StripeObject { return value && typeof value === "object" ? value as StripeObject : {}; }
export async function stripeRequest<T extends StripeObject>(path: string, method: "GET" | "POST" = "GET", body?: URLSearchParams, idempotencyKey?: string): Promise<T> {
  requireStripeConfig();
  try {
    const response = await fetch(`https://api.stripe.com/v1/${path}`, {
      method, headers: { Authorization: `Bearer ${runtimeString("STRIPE_SECRET_KEY")}`, "Stripe-Version": STRIPE_API_VERSION,
        ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}), ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
      body, signal: AbortSignal.timeout(15000),
    });
    const result = await response.json() as T;
    if (!response.ok) { console.error("Stripe request failed", response.status, response.headers.get("request-id")); throw new ApiError(502, "O serviço de pagamento não conseguiu concluir a solicitação. Tente novamente."); }
    return result;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(502, "Não foi possível conectar ao serviço de pagamento. Tente novamente.");
  }
}
export function safeStripeUrl(value: unknown, host: string) {
  try { const url = new URL(String(value)); if (url.protocol === "https:" && url.hostname === host && !url.username && !url.password) return url.toString(); } catch { /* Invalid provider response. */ }
  throw new ApiError(502, "O serviço de pagamento não retornou uma página válida.");
}
export async function subscriptionRow(userId: string) {
  return getD1().prepare(`SELECT user_id AS userId, provider, plan, status, customer_id AS customerId, subscription_id AS subscriptionId,
    checkout_session_id AS checkoutSessionId, current_period_end AS currentPeriodEnd, cancel_at_period_end AS cancelAtPeriodEnd,
    stripe_mode AS stripeMode, stripe_event_created AS stripeEventCreated FROM subscriptions WHERE user_id = ?`).bind(userId).first<SubscriptionRecord>();
}
export async function attemptBySession(sessionId: string, userId?: string) {
  return getD1().prepare(`SELECT ${attemptFields} FROM billing_checkouts WHERE session_id = ? AND mode = ? ${userId ? "AND user_id = ?" : ""}`)
    .bind(...(userId ? [sessionId, stripeMode(), userId] : [sessionId, stripeMode()])).first<CheckoutAttempt>();
}
export async function pendingAttempt(userId: string) {
  return getD1().prepare(`SELECT ${attemptFields} FROM billing_checkouts WHERE user_id = ? AND mode = ? AND status IN ('creating', 'open', 'processing') ORDER BY created_at DESC LIMIT 1`)
    .bind(userId, stripeMode()).first<CheckoutAttempt>();
}
export function statusFor(row: SubscriptionRecord | null): BillingStatus {
  const mode = stripeMode(), sameMode = row?.stripeMode === mode;
  return { mode, configured: stripeConfigured(), paidActive: isPaidPlan(effectiveSubscription(row, mode).plan), plan: row?.plan || "trial", status: row?.status || "active", currentPeriodEnd: sameMode ? row?.currentPeriodEnd || null : null,
    cancelAtPeriodEnd: Boolean(sameMode && row?.cancelAtPeriodEnd), canManage: Boolean(sameMode && row?.customerId) };
}
async function recordEvent(event?: VerifiedEvent) {
  if (event) await getD1().prepare("INSERT INTO webhook_events (id, provider, event_type) VALUES (?, 'stripe', ?) ON CONFLICT(id) DO NOTHING").bind(event.id, event.type).run();
}

export async function syncSubscription(subscriptionId: string, expectedUser?: string, event?: VerifiedEvent, pendingPayment = false) {
  if (!/^sub_[a-zA-Z0-9_]{2,200}$/.test(subscriptionId)) throw new ApiError(400, "Assinatura inválida.");
  const remote = await stripeRequest<StripeObject>(`subscriptions/${encodeURIComponent(subscriptionId)}?expand[]=latest_invoice`);
  const metadata = object(remote.metadata);
  const existing = await getD1().prepare("SELECT user_id AS userId FROM subscriptions WHERE subscription_id = ? AND stripe_mode = ?").bind(subscriptionId, stripeMode()).first<{ userId: string }>();
  const userId = typeof metadata.user_id === "string" ? metadata.user_id : existing?.userId;
  if (expectedUser && userId !== expectedUser) throw new ApiError(404, "Assinatura não encontrada nesta conta.");
  if (!userId) { await recordEvent(event); return false; }
  const current = await subscriptionRow(userId);
  const attemptId = typeof metadata.checkout_attempt_id === "string" ? metadata.checkout_attempt_id : "";
  const attempt = attemptId ? await getD1().prepare(`SELECT ${attemptFields} FROM billing_checkouts WHERE id = ? AND user_id = ? AND mode = ?`).bind(attemptId, userId, stripeMode()).first<CheckoutAttempt>() : null;
  if (!attempt && (current?.subscriptionId !== subscriptionId || current.stripeMode !== stripeMode())) { await recordEvent(event); return false; }
  if (current?.stripeMode === stripeMode() && current.subscriptionId && current.subscriptionId !== subscriptionId && !["canceled", "cancelled", "incomplete_expired"].includes(current.status)) {
    await recordEvent(event); return false;
  }
  const items = object(remote.items).data;
  const item = Array.isArray(items) && items.length === 1 ? object(items[0]) : {};
  const price = object(item.price), recurring = object(price.recurring);
  const plan = metadata.plan;
  if (!isPaidPlan(plan) || (attempt && attempt.plan !== plan) || price.unit_amount !== paidPlans[plan].amountCents || price.currency !== "brl"
    || recurring.interval !== paidPlans[plan].interval || recurring.interval_count !== paidPlans[plan].intervalCount || item.quantity !== 1) {
    throw new ApiError(502, "Os dados da assinatura não correspondem ao plano escolhido.");
  }
  const rawEnd = item.current_period_end ?? remote.current_period_end ?? remote.trial_end;
  const currentPeriodEnd = typeof rawEnd === "number" && Number.isFinite(rawEnd) && rawEnd > 0 && rawEnd < 1e11 ? new Date(rawEnd * 1000).toISOString() : null;
  let status = typeof remote.status === "string" ? remote.status : "incomplete";
  if (["active", "trialing"].includes(status) && !currentPeriodEnd) throw new ApiError(502, "Não foi possível confirmar a validade da assinatura.");
  if (status === "active" && (pendingPayment || object(remote.latest_invoice).status !== "paid")) status = "payment_pending";
  const created = event?.created ?? current?.stripeEventCreated ?? 0;
  const statements = [getD1().prepare(`INSERT INTO subscriptions (user_id, provider, plan, status, customer_id, subscription_id, current_period_end, cancel_at_period_end, stripe_mode, stripe_event_created)
    VALUES (?, 'stripe', ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET provider = 'stripe', plan = excluded.plan, status = excluded.status, customer_id = excluded.customer_id,
      subscription_id = excluded.subscription_id, current_period_end = excluded.current_period_end, cancel_at_period_end = excluded.cancel_at_period_end,
      stripe_mode = excluded.stripe_mode, stripe_event_created = excluded.stripe_event_created, updated_at = CURRENT_TIMESTAMP
    WHERE subscriptions.stripe_mode IS NULL OR subscriptions.stripe_mode != excluded.stripe_mode OR subscriptions.stripe_event_created <= excluded.stripe_event_created`)
    .bind(userId, plan, status, stripeId(remote.customer), subscriptionId, currentPeriodEnd, remote.cancel_at_period_end ? 1 : 0, stripeMode(), created)];
  if (attempt) statements.push(getD1().prepare(`UPDATE billing_checkouts SET subscription_id = ?, status = CASE WHEN ? IN ('active', 'trialing') THEN 'complete' ELSE status END,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(subscriptionId, status, attempt.id));
  if (event) statements.push(getD1().prepare("INSERT INTO webhook_events (id, provider, event_type) VALUES (?, 'stripe', ?)").bind(event.id, event.type));
  try { await getD1().batch(statements); }
  catch (error) {
    if (event && await getD1().prepare("SELECT id FROM webhook_events WHERE id = ?").bind(event.id).first()) return true;
    throw error;
  }
  return true;
}

export async function syncCheckout(sessionId: string, expectedUser?: string, event?: VerifiedEvent) {
  if (!/^cs_[a-zA-Z0-9_]{2,200}$/.test(sessionId)) throw new ApiError(400, "Pagamento inválido.");
  let attempt = await attemptBySession(sessionId, expectedUser);
  if (expectedUser && !attempt) throw new ApiError(404, "Pagamento não encontrado nesta conta.");
  const remote = await stripeRequest<StripeObject>(`checkout/sessions/${encodeURIComponent(sessionId)}`);
  if (!attempt) {
    const attemptId = object(remote.metadata).checkout_attempt_id;
    if (typeof attemptId === "string") attempt = await getD1().prepare(`SELECT ${attemptFields} FROM billing_checkouts WHERE id = ? AND mode = ?`).bind(attemptId, stripeMode()).first<CheckoutAttempt>();
  }
  if (!attempt || remote.client_reference_id !== attempt.userId || remote.mode !== "subscription" || object(remote.metadata).plan !== attempt.plan) {
    if (expectedUser) throw new ApiError(404, "Pagamento não encontrado nesta conta.");
    await recordEvent(event); return null;
  }
  if (remote.status === "expired") {
    await getD1().prepare("UPDATE billing_checkouts SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'complete'").bind(attempt.id).run();
    await recordEvent(event); return { ...attempt, status: "expired" };
  }
  const subscriptionId = stripeId(remote.subscription);
  if (remote.status === "complete" && subscriptionId) {
    await getD1().prepare("UPDATE billing_checkouts SET session_id = ?, subscription_id = ?, status = CASE WHEN status = 'complete' THEN status ELSE 'processing' END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(sessionId, subscriptionId, attempt.id).run();
    await syncSubscription(subscriptionId, attempt.userId, event, !["paid", "no_payment_required"].includes(String(remote.payment_status)));
  } else await recordEvent(event);
  return attemptBySession(sessionId, attempt.userId);
}

export async function processStripeEvent(event: VerifiedEvent) {
  await ensureSchema();
  if (await getD1().prepare("SELECT id FROM webhook_events WHERE id = ?").bind(event.id).first()) return { received: true, duplicate: true };
  const remote = event.data.object;
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed", "checkout.session.expired"].includes(event.type)) {
    await syncCheckout(stripeId(remote), undefined, event);
  } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"].includes(event.type)) {
    await syncSubscription(stripeId(remote), undefined, event);
  } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(event.type)) {
    const subscriptionId = stripeId(object(object(remote.parent).subscription_details).subscription) || stripeId(remote.subscription);
    if (subscriptionId) await syncSubscription(subscriptionId, undefined, event); else await recordEvent(event);
  } else await recordEvent(event);
  return { received: true };
}

export async function billingStatus(userId: string, sessionId?: string) {
  let attempt: CheckoutAttempt | null = null;
  if (sessionId) attempt = await syncCheckout(sessionId, userId);
  const row = await subscriptionRow(userId), effective = effectiveSubscription(row, stripeMode());
  return { ...statusFor(row), ...(attempt ? { paymentStatus: attempt.status === "complete" && effective.plan === attempt.plan ? "confirmed" : attempt.status === "expired" ? "expired" : attempt.status === "failed" ? "failed" : "pending" } : {}), subscription: effective };
}
