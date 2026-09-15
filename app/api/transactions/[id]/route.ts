import { ApiError, errorResponse, getD1, requireApiUser } from "../../_lib/server";

type Context = { params: Promise<{ id: string }> };

function parsePayload(payload: { type?: string; description?: string; amount?: number; transactionDate?: string; transactionTime?: string }) {
  if (payload.type !== "income" && payload.type !== "expense") throw new ApiError(400, "Tipo inválido.");
  const description = payload.description?.trim().slice(0, 120) || "";
  const amount = Number(payload.amount);
  const date = payload.transactionDate || "";
  const time = payload.transactionTime || "";
  if (description.length < 2) throw new ApiError(400, "Informe uma descrição.");
  if (!Number.isFinite(amount) || amount <= 0) throw new ApiError(400, "Informe um valor válido.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "Data inválida.");
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError(400, "Horário inválido.");
  return { type: payload.type, description, amountCents: Math.round(amount * 100), date, time };
}

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const values = parsePayload(await request.json() as Parameters<typeof parsePayload>[0]);
    const result = await getD1().prepare(`
      UPDATE transactions
      SET type = ?, description = ?, amount_cents = ?, transaction_date = ?, transaction_time = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).bind(values.type, values.description, values.amountCents, values.date, values.time, id, user.id).run();
    if (!result.meta.changes) throw new ApiError(404, "Lançamento não encontrado.");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const result = await getD1().prepare("DELETE FROM transactions WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    if (!result.meta.changes) throw new ApiError(404, "Lançamento não encontrado.");
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
