import { ApiError, errorResponse, getD1, runtimeString } from "../../_lib/server";
import { requireActiveWhatsAppAccess } from "../_lib/whatsapp-access";

export async function POST(request: Request) {
  try {
    const expected = runtimeString("N8N_SHARED_SECRET");
    if (!expected || request.headers.get("x-granize-secret") !== expected) throw new ApiError(401, "Integração não autorizada.");
    const payload = await request.json() as {
      phone?: string;
      type?: string;
      description?: string;
      amount?: number;
      transactionDate?: string;
      transactionTime?: string;
      externalId?: string;
    };
    if (!payload.phone || (payload.type !== "income" && payload.type !== "expense")) throw new ApiError(400, "Dados incompletos.");
    const description = payload.description?.trim().slice(0, 120) || "Lançamento via WhatsApp";
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "Valor inválido.");
    const date = payload.transactionDate && /^\d{4}-\d{2}-\d{2}$/.test(payload.transactionDate) ? payload.transactionDate : new Date().toISOString().slice(0, 10);
    const fallbackTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date());
    const time = payload.transactionTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(payload.transactionTime) ? payload.transactionTime : fallbackTime;
    const access = await requireActiveWhatsAppAccess(payload.phone);
    if (!access.allowed) throw new ApiError(access.reason === "not_linked" ? 404 : 403, access.reason === "not_linked" ? "WhatsApp não vinculado." : "Assinatura inativa.");
    const db = getD1();
    const id = crypto.randomUUID();
    await db.prepare(`
      INSERT INTO transactions (id, user_id, type, description, amount_cents, transaction_date, transaction_time, source, external_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'whatsapp', ?)
      ON CONFLICT(user_id, external_id) DO NOTHING
    `).bind(id, access.access.userId, payload.type, description, Math.round(amount * 100), date, time, payload.externalId || id).run();
    return Response.json({ ok: true, id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
