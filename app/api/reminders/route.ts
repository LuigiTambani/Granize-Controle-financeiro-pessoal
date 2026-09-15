import { ApiError, errorResponse, getD1, requireApiUser } from "../_lib/server";

type ReminderPayload = { title?: string; notes?: string; kind?: string; amount?: number | null; dueDate?: string };

export function validateReminder(payload: ReminderPayload) {
  const title = payload.title?.trim().slice(0, 120) || "";
  const notes = payload.notes?.trim().slice(0, 500) || "";
  const kind = ["payment", "income", "general"].includes(payload.kind || "") ? payload.kind! : "payment";
  const dueDate = payload.dueDate || "";
  const numericAmount = payload.amount === null || payload.amount === undefined || payload.amount === 0 ? null : Number(payload.amount);
  if (title.length < 2) throw new ApiError(400, "Informe um título para o lembrete.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new ApiError(400, "Informe uma data válida.");
  if (numericAmount !== null && (!Number.isFinite(numericAmount) || numericAmount < 0)) throw new ApiError(400, "Informe um valor válido.");
  return { title, notes, kind, dueDate, amountCents: numericAmount === null ? null : Math.round(numericAmount * 100) };
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const { results } = await getD1().prepare(`SELECT id, title, notes, kind, amount_cents AS amountCents,
      due_date AS dueDate, status, created_at AS createdAt FROM reminders WHERE user_id = ?
      ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, due_date ASC, created_at DESC`).bind(user.id).all();
    return Response.json({ reminders: results });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const values = validateReminder(await request.json() as ReminderPayload);
    const id = crypto.randomUUID();
    await getD1().prepare(`INSERT INTO reminders (id, user_id, title, notes, kind, amount_cents, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, user.id, values.title, values.notes, values.kind, values.amountCents, values.dueDate).run();
    return Response.json({ reminder: { id, ...values, status: "active" } }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
