import { errorResponse } from "../../_lib/server";
import { billingStatus, requireBillingUser, stripeMode, subscriptionRow, syncSubscription } from "../../_lib/stripe";

export async function GET(request: Request) {
  try {
    const user = await requireBillingUser(request);
    const params = new URL(request.url).searchParams;
    const sessionId = params.get("session_id") || undefined;
    if (params.get("refresh") === "1" && !sessionId) {
      const row = await subscriptionRow(user.id);
      if (row?.subscriptionId && row.stripeMode === stripeMode()) await syncSubscription(row.subscriptionId, user.id);
    }
    return Response.json(await billingStatus(user.id, sessionId), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return errorResponse(error); }
}
