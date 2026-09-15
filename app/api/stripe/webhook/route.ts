import { ApiError, errorResponse, getD1, runtimeString } from "../../_lib/server";

type StripeObject = Record<string, unknown> & { id?: string; metadata?: Record<string, string> };
type StripeEvent = { id: string; type: string; data: { object: StripeObject } };

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function verify(rawBody: string, signature: string, secret: string) {
  const parts = signature.split(",").map((part) => part.split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1] || "";
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`)));
  return signatures.some((candidate) => safeEqual(candidate, digest));
}

export async function POST(request: Request) {
  try {
    const secret = runtimeString("STRIPE_WEBHOOK_SECRET");
    const signature = request.headers.get("stripe-signature") || "";
    const rawBody = await request.text();
    if (!secret || !(await verify(rawBody, signature, secret))) throw new ApiError(400, "Assinatura Stripe inválida.");
    const event = JSON.parse(rawBody) as StripeEvent;
    const db = getD1();
    const previous = await db.prepare("SELECT id FROM webhook_events WHERE id = ?").bind(event.id).first();
    if (previous) return Response.json({ received: true, duplicate: true });
    const object = event.data.object;
    const userId = object.metadata?.user_id || (typeof object.client_reference_id === "string" ? object.client_reference_id : "");
    const plan = object.metadata?.plan || "pro";

    if (event.type === "checkout.session.completed" && userId) {
      await db.prepare(`
        INSERT INTO subscriptions (user_id, provider, plan, status, customer_id, subscription_id, checkout_session_id)
        VALUES (?, 'stripe', ?, 'active', ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = 'active',
          customer_id = excluded.customer_id, subscription_id = excluded.subscription_id,
          checkout_session_id = excluded.checkout_session_id, updated_at = CURRENT_TIMESTAMP
      `).bind(userId, plan, String(object.customer || ""), String(object.subscription || ""), String(object.id || "")).run();
      await db.prepare("UPDATE users SET onboarding_completed = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(userId).run();
    }

    if ((event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") && userId) {
      const status = event.type.endsWith("deleted") ? "cancelled" : String(object.status || "active");
      const periodEnd = typeof object.current_period_end === "number" ? new Date(object.current_period_end * 1000).toISOString() : null;
      await db.prepare(`
        UPDATE subscriptions SET status = ?, plan = ?, current_period_end = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
      `).bind(status, plan, periodEnd, userId).run();
    }

    if (event.type === "invoice.paid" || event.type === "invoice.payment_failed") {
      const subscriptionId = typeof object.subscription === "string" ? object.subscription : "";
      if (subscriptionId) {
        await db.prepare("UPDATE subscriptions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE subscription_id = ?")
          .bind(event.type === "invoice.paid" ? "active" : "past_due", subscriptionId).run();
      }
    }

    await db.prepare("INSERT INTO webhook_events (id, provider, event_type) VALUES (?, 'stripe', ?)").bind(event.id, event.type).run();
    return Response.json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
