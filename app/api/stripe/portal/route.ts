import { ApiError, errorResponse, getD1, publicOrigin, requireApiUser, runtimeString } from "../../_lib/server";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const secretKey = runtimeString("STRIPE_SECRET_KEY");
    if (!secretKey) throw new ApiError(503, "Stripe não configurado.");
    const row = await getD1().prepare("SELECT customer_id AS customerId FROM subscriptions WHERE user_id = ?").bind(user.id).first<{ customerId: string | null }>();
    if (!row?.customerId) throw new ApiError(400, "Nenhuma assinatura ativa encontrada.");
    const body = new URLSearchParams({ customer: row.customerId, return_url: `${publicOrigin(request)}/?view=dashboard` });
    const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const session = await response.json() as { url?: string; error?: { message?: string } };
    if (!response.ok || !session.url) throw new ApiError(502, session.error?.message || "Portal indisponível.");
    return Response.json({ url: session.url });
  } catch (error) {
    return errorResponse(error);
  }
}
