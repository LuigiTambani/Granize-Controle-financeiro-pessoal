import { ApiError, errorResponse, runtimeString } from "../../_lib/server";
import { processStripeEvent, stripeMode, type VerifiedEvent } from "../../_lib/stripe";

import { verifyStripeSignature } from "../../_lib/stripe-signature";

export async function POST(request: Request) {
  try {
    const secret = runtimeString("STRIPE_WEBHOOK_SECRET");
    if (!secret) throw new ApiError(503, "Confirmação de pagamentos ainda não configurada.");
    const rawBody = await request.text();
    if (!(await verifyStripeSignature(rawBody, request.headers.get("stripe-signature") || "", secret))) throw new ApiError(400, "Assinatura Stripe inválida.");
    let event: VerifiedEvent;
    try { event = JSON.parse(rawBody) as VerifiedEvent; } catch { throw new ApiError(400, "Evento inválido."); }
    if (!event || typeof event.id !== "string" || !/^evt_[a-zA-Z0-9_]+$/.test(event.id) || typeof event.type !== "string" || !Number.isFinite(event.created)
      || typeof event.livemode !== "boolean" || !event.data?.object || typeof event.data.object !== "object") throw new ApiError(400, "Evento inválido.");
    if (event.livemode !== (stripeMode() === "live")) throw new ApiError(400, "O evento não pertence ao ambiente de pagamento configurado.");
    return Response.json(await processStripeEvent(event));
  } catch (error) { return errorResponse(error); }
}
