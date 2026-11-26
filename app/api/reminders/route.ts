import { errorResponse, getD1, requireApiUser } from "../_lib/server";
import { validateReminder } from "../_lib/reminders";

type ReminderPayload = Parameters<typeof validateReminder>[0];

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
