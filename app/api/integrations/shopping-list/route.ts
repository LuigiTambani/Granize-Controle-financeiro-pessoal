import { ApiError, ensureSchema, errorResponse, getD1, runtimeString } from "../../_lib/server";
import { applyShoppingCommand } from "../../_lib/shopping";
import { requireActiveWhatsAppAccess } from "../_lib/whatsapp-access";
import { parseShoppingCommand } from "../../../lib/shopping";

export async function POST(request: Request) {
  try {
    const expected = runtimeString("N8N_SHARED_SECRET");
    if (!expected || request.headers.get("x-granize-secret") !== expected) throw new ApiError(401, "Integração não autorizada.");
    const payload = await request.json() as { phone?: unknown; text?: unknown; externalId?: unknown; inputType?: unknown };
    if (typeof payload.text !== "string" || payload.text.length > 6000 || typeof payload.phone !== "string") throw new ApiError(400, "Mensagem inválida.");
    const command = parseShoppingCommand(payload.text);
    if (!command) return Response.json({ handled: false });
    await ensureSchema();
    const access = await requireActiveWhatsAppAccess(payload.phone);
    if (!access.allowed) throw new ApiError(access.reason === "not_linked" ? 404 : 403, access.reason === "not_linked" ? "WhatsApp não vinculado." : "Assinatura inativa.");
    const externalId = typeof payload.externalId === "string" && payload.externalId.length <= 200 ? payload.externalId : "";
    if (command.action !== "list" && command.action !== "help" && !externalId) throw new ApiError(400, "Identificador da mensagem ausente.");
    const text = await applyShoppingCommand(getD1(), access.access.userId, command, "whatsapp", externalId || undefined);
    const audioIntro = payload.inputType === "audio" ? `🎙️ Entendi: _${payload.text}_\n\n` : "";
    return Response.json({ handled: true, responseText: `${audioIntro}${text}` });
  } catch (error) { return errorResponse(error); }
}
