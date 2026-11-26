export const paidPlans = {
  basic: { name: "Básico", amountCents: 1290, interval: "month", intervalCount: 1 },
  pro: { name: "Pro", amountCents: 5990, interval: "month", intervalCount: 6 },
  annual: { name: "Anual", amountCents: 9990, interval: "year", intervalCount: 1 },
} as const;
export type PaidPlanId = keyof typeof paidPlans;
export function isPaidPlan(value: unknown): value is PaidPlanId {
  return typeof value === "string" && Object.hasOwn(paidPlans, value);
}
export type SubscriptionRecord = {
  userId?: string;
  provider: string;
  plan: string;
  status: string;
  customerId: string | null;
  subscriptionId: string | null;
  checkoutSessionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: number;
  stripeMode: string | null;
  stripeEventCreated: number;
};
export function effectiveSubscription(row: SubscriptionRecord | null, mode = "test", now = Date.now()) {
  if (row && row.provider === "stripe" && row.stripeMode === mode && isPaidPlan(row.plan)
    && ["active", "trialing"].includes(row.status) && Date.parse(row.currentPeriodEnd || "") > now) {
    return { plan: row.plan, status: row.status, currentPeriodEnd: row.currentPeriodEnd };
  }
  return { plan: "trial", status: "active", currentPeriodEnd: null };
}
export type BillingStatus = {
  mode: "test" | "live";
  configured: boolean;
  paidActive: boolean;
  plan: string;
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canManage: boolean;
  paymentStatus?: "confirmed" | "pending" | "expired" | "failed";
};
