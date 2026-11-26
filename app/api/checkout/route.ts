import { ApiError, errorResponse, getD1 } from "../_lib/server";
import { billingOrigin, pendingAttempt, requireBillingUser, requireStripeConfig, safeStripeUrl, stripeId, stripeMode, stripeRequest, subscriptionRow, syncCheckout, syncSubscription, type CheckoutAttempt } from "../_lib/stripe";
import { isPaidPlan, paidPlans } from "../../lib/billing";

export async function POST(request: Request) {
  let attempt: CheckoutAttempt | null = null;
  let requested = false;
  try {
    const user = await requireBillingUser(request);
    const payload = await request.json().catch(() => null) as { plan?: unknown } | null;
    if (!isPaidPlan(payload?.plan)) throw new ApiError(400, "Escolha um plano pago válido.");
    requireStripeConfig();
    const origin = billingOrigin(request), planKey = payload.plan, plan = paidPlans[planKey];
    let subscription = await subscriptionRow(user.id);
    if (subscription?.stripeMode === stripeMode() && subscription.subscriptionId) {
      await syncSubscription(subscription.subscriptionId, user.id);
      subscription = await subscriptionRow(user.id);
      if (subscription && !["canceled", "cancelled", "incomplete_expired"].includes(subscription.status)) throw new ApiError(409, "Você já tem uma assinatura em andamento. Gerencie o pagamento pelo seu perfil.");
    }
    attempt = await pendingAttempt(user.id);
    if (attempt?.status === "creating" && Date.parse(attempt.createdAt.includes("T") ? attempt.createdAt : `${attempt.createdAt.replace(" ", "T")}Z`) < Date.now() - 30000) {
      if (attempt.plan !== planKey) throw new ApiError(409, "O pagamento anterior está sendo recuperado. Tente novamente com o mesmo plano.");
    } else if (attempt?.status === "creating") {
      throw new ApiError(409, "Um pagamento já está sendo preparado. Aguarde um instante e tente novamente.");
    } else if (attempt?.sessionId) {
      const remote = await stripeRequest<Record<string, unknown>>(`checkout/sessions/${encodeURIComponent(attempt.sessionId)}`);
      if (remote.status === "open" && attempt.plan === planKey) return Response.json({ checkoutUrl: safeStripeUrl(remote.url, "checkout.stripe.com") });
      if (remote.status === "complete") {
        await syncCheckout(attempt.sessionId, user.id);
        throw new ApiError(409, "O pagamento anterior já foi concluído ou está em processamento. Confira seu perfil antes de tentar novamente.");
      }
      if (remote.status === "open") await stripeRequest(`checkout/sessions/${encodeURIComponent(attempt.sessionId)}/expire`, "POST", new URLSearchParams(), `granize-expire-${attempt.id}`);
      await getD1().prepare("UPDATE billing_checkouts SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'complete'").bind(attempt.id).run();
      attempt = null;
    }
    if (!attempt) {
      const id = crypto.randomUUID();
      try { await getD1().prepare("INSERT INTO billing_checkouts (id, user_id, plan, mode) VALUES (?, ?, ?, ?)").bind(id, user.id, planKey, stripeMode()).run(); }
      catch (error) { if (await pendingAttempt(user.id)) throw new ApiError(409, "Um pagamento já está sendo preparado. Aguarde um instante."); throw error; }
      attempt = { id, userId: user.id, plan: planKey, mode: stripeMode(), status: "creating", sessionId: null, checkoutUrl: null, expiresAt: 0, createdAt: new Date().toISOString() };
    }
    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("payment_method_types[0]", "card");
    body.set("client_reference_id", user.id);
    if (subscription?.stripeMode === stripeMode() && subscription.customerId) body.set("customer", subscription.customerId);
    else body.set("customer_email", user.email);
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", "brl");
    body.set("line_items[0][price_data][unit_amount]", String(plan.amountCents));
    body.set("line_items[0][price_data][product_data][name]", `Granize ${plan.name}`);
    body.set("line_items[0][price_data][recurring][interval]", plan.interval);
    body.set("line_items[0][price_data][recurring][interval_count]", String(plan.intervalCount));
    for (const [name, value] of Object.entries({ user_id: user.id, plan: planKey, checkout_attempt_id: attempt.id })) {
      body.set(`metadata[${name}]`, value); body.set(`subscription_data[metadata][${name}]`, value);
    }
    body.set("success_url", `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    body.set("cancel_url", `${origin}/?view=plans&checkout=cancelled&plan=${planKey}`);
    body.set("locale", "pt-BR");
    body.set("allow_promotion_codes", "true");
    requested = true;
    const session = await stripeRequest<Record<string, unknown>>("checkout/sessions", "POST", body, `granize-checkout-${attempt.id}`);
    const sessionId = stripeId(session), url = safeStripeUrl(session.url, "checkout.stripe.com");
    if (!sessionId.startsWith("cs_")) throw new ApiError(502, "O pagamento não retornou um identificador válido.");
    await getD1().prepare("UPDATE billing_checkouts SET session_id = ?, checkout_url = ?, expires_at = ?, status = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'creating'")
      .bind(sessionId, url, Number(session.expires_at) || 0, attempt.id).run();
    return Response.json({ checkoutUrl: url });
  } catch (error) {
    if (attempt?.status === "creating" && !requested && !(error instanceof ApiError && error.status === 409)) {
      await getD1().prepare("UPDATE billing_checkouts SET status = 'failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'creating'").bind(attempt.id).run().catch(() => undefined);
    }
    return errorResponse(error);
  }
}
