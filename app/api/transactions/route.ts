import { ApiError, errorResponse, getD1, requireApiUser } from "../_lib/server";

type TransactionPayload = {
  type?: "income" | "expense";
  description?: string;
  amount?: number;
  transactionDate?: string;
  transactionTime?: string;
};

function currentTime() {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date());
}

function validate(payload: TransactionPayload) {
  if (payload.type !== "income" && payload.type !== "expense") throw new ApiError(400, "Tipo de lançamento inválido.");
  const description = payload.description?.trim().slice(0, 120) || "";
  if (description.length < 2) throw new ApiError(400, "Informe uma descrição.");
  const amount = Number(payload.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) throw new ApiError(400, "Informe um valor válido.");
  const date = payload.transactionDate || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError(400, "Data inválida.");
  const time = payload.transactionTime || currentTime();
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new ApiError(400, "Horário inválido.");
  return { type: payload.type, description, amountCents: Math.round(amount * 100), date, time };
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const db = getD1();
    const params = new URL(request.url).searchParams;
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) throw new ApiError(400, "Período inválido.");
    const { results } = await db.prepare(`
      SELECT id, type, description, amount_cents AS amountCents,
             transaction_date AS transactionDate,
             COALESCE(NULLIF(transaction_time, ''), substr(created_at, 12, 5)) AS transactionTime,
             source, created_at AS createdAt
      FROM transactions
      WHERE user_id = ? AND (? = '' OR transaction_date >= ?) AND (? = '' OR transaction_date <= ?)
      ORDER BY transaction_date DESC, transaction_time DESC, created_at DESC
      LIMIT 200
    `).bind(user.id, from, from, to, to).all();
    const summary = await db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expenseCents
      FROM transactions WHERE user_id = ? AND (? = '' OR transaction_date >= ?) AND (? = '' OR transaction_date <= ?)
    `).bind(user.id, from, from, to, to).first();
    return Response.json({ transactions: results, summary });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    const values = validate(await request.json() as TransactionPayload);
    const id = crypto.randomUUID();
    await getD1().prepare(`
      INSERT INTO transactions (id, user_id, type, description, amount_cents, transaction_date, transaction_time, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')
    `).bind(id, user.id, values.type, values.description, values.amountCents, values.date, values.time).run();
    return Response.json({ transaction: { id, ...values, transactionDate: values.date, transactionTime: values.time, source: "manual" } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
