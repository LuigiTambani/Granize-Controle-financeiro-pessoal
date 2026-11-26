import { ApiError, errorResponse } from "../../_lib/server";
import { billingOrigin, requireBillingUser, requireStripeConfig, safeStripeUrl, stripeMode, stripeRequest, subscriptionRow } from "../../_lib/stripe";

export async function POST(request: Request) {
  try {
    const user = await requireBillingUser(request);
    requireStripeConfig();
    const row = await subscriptionRow(user.id);
    if (!row?.customerId || row.stripeMode !== stripeMode()) throw new ApiError(404, "Sua conta ainda não possui pagamentos para gerenciar.");
    const body = new URLSearchParams({ customer: row.customerId, return_url: `${billingOrigin(request)}/?view=dashboard&billing=refresh` });
    const result = await stripeRequest<Record<string, unknown>>("billing_portal/sessions", "POST", body);
    return Response.json({ url: safeStripeUrl(result.url, "billing.stripe.com") });
  } catch (error) { return errorResponse(error); }
}
