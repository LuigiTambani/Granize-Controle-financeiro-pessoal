import assert from "node:assert/strict";
import test from "node:test";
import { effectiveSubscription, isPaidPlan, paidPlans } from "../app/lib/billing.ts";

test("catálogo de cobranças usa valores fixos em centavos e rejeita planos desconhecidos", () => {
  assert.equal(paidPlans.basic.amountCents, 1290);
  assert.equal(paidPlans.pro.amountCents, 5990);
  assert.equal(paidPlans.annual.amountCents, 9990);
  for (const value of ["trial", "constructor", "__proto__", "free", undefined, {}, 1290]) assert.equal(isPaidPlan(value), false);
});

test("Grátis é permanente e não expira, independentemente do pagamento pendente ou cancelado", () => {
  const now = Date.parse("2026-11-25T12:00:00Z");
  const base = { provider: "stripe", stripeMode: "test", plan: "basic", status: "active", currentPeriodEnd: "2026-12-25T12:00:00Z" };
  assert.equal(effectiveSubscription(base, "test", now).plan, "basic");
  for (const status of ["checkout_pending", "incomplete", "past_due", "payment_pending", "unpaid", "canceled", "paused"]) {
    assert.deepEqual(effectiveSubscription({ ...base, status }, "test", now), { plan: "trial", status: "active", currentPeriodEnd: null });
  }
  assert.equal(effectiveSubscription({ ...base, currentPeriodEnd: "2026-11-24" }, "test", now).plan, "trial");
  assert.equal(effectiveSubscription(base, "live", now).plan, "trial");
  assert.equal(effectiveSubscription(null, "test", now).plan, "trial");
  assert.deepEqual(effectiveSubscription({ provider: "local", plan: "trial", status: "active", currentPeriodEnd: null }, "test", now + 10 * 365 * 86400000), { plan: "trial", status: "active", currentPeriodEnd: null });
});
