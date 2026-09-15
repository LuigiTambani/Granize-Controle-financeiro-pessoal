import { ApiError, errorResponse, getD1, publicOrigin, requireApiUser, runtimeString } from "../_lib/server";

const plans = {
  basic: { name: "Granize Básico", amount: 1290, interval: "month", intervalCount: 1 },
  pro: { name: "Granize Pro Semestral", amount: 5990, interval: "month", intervalCount: 6 },
  annual: { name: "Granize Anual", amount: 9990, interval: "year", intervalCount: 1 },
} as const;

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const secretKey = runtimeString("STRIPE_SECRET_KEY");
    if (!secretKey) throw new ApiError(503, "Stripe Checkout aguardando a chave de teste.");
    const payload = await request.json() as { plan?: keyof typeof plans };
    const planKey = payload.plan || "pro";
    const plan = plans[planKey];
    if (!plan) throw new ApiError(400, "Plano inválido.");
    const origin = publicOrigin(request);
    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("client_reference_id", user.id);
    body.set("customer_email", user.email);
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", "brl");
    body.set("line_items[0][price_data][unit_amount]", String(plan.amount));
    body.set("line_items[0][price_data][product_data][name]", plan.name);
    body.set("line_items[0][price_data][recurring][interval]", plan.interval);
    body.set("line_items[0][price_data][recurring][interval_count]", String(plan.intervalCount));
    body.set("metadata[user_id]", user.id);
    body.set("metadata[plan]", planKey);
    body.set("subscription_data[metadata][user_id]", user.id);
    body.set("subscription_data[metadata][plan]", planKey);
    body.set("success_url", `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    body.set("cancel_url", `${origin}/?checkout=cancelled`);
    body.set("locale", "pt-BR");
    body.set("allow_promotion_codes", "true");

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const session = await response.json() as { id?: string; url?: string; error?: { message?: string } };
    if (!response.ok || !session.id || !session.url) throw new ApiError(502, session.error?.message || "Não foi possível iniciar o pagamento.");
    await getD1().prepare(`
      INSERT INTO subscriptions (user_id, provider, plan, status, checkout_session_id)
      VALUES (?, 'stripe', ?, 'checkout_pending', ?)
      ON CONFLICT(user_id) DO UPDATE SET plan = excluded.plan, status = excluded.status,
        checkout_session_id = excluded.checkout_session_id, updated_at = CURRENT_TIMESTAMP
    `).bind(user.id, planKey, session.id).run();
    return Response.json({ checkoutUrl: session.url });
  } catch (error) {
    return errorResponse(error);
  }
}
