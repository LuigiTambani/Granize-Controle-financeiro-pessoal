import { ApiError, errorResponse, getD1, requireApiUser } from "../../_lib/server";
import { validateReminder } from "../route";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: Context) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const payload = await request.json() as { title?: string; notes?: string; kind?: string; amount?: number | null; dueDate?: string; status?: string };
    const values = validateReminder(payload);
    const status = payload.status === "completed" ? "completed" : "active";
    const result = await getD1().prepare(`UPDATE reminders SET title = ?, notes = ?, kind = ?, amount_cents = ?, due_date = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?`).bind(values.title, values.notes, values.kind, values.amountCents, values.dueDate, status, id, user.id).run();
    if (!result.meta.changes) throw new ApiError(404, "Lembrete não encontrado.");
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const result = await getD1().prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?").bind(id, user.id).run();
    if (!result.meta.changes) throw new ApiError(404, "Lembrete não encontrado.");
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
