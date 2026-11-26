import { ApiError, errorResponse, getD1, requireApiUser } from "../_lib/server";
import { assembleOverview, isOverviewMonth, overviewPeriod, type OverviewTotals, type OverviewTransaction } from "../../lib/overview";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const db = getD1();
    const selectedMonth = new URL(request.url).searchParams.get("month");
    if (selectedMonth !== null && !isOverviewMonth(selectedMonth)) {
      throw new ApiError(400, "Escolha um mês válido.");
    }
    const period = overviewPeriod(new Date(), selectedMonth ?? undefined);
    const aggregate = `
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expenseCents,
      SUM(CASE WHEN type = 'income' THEN 1 ELSE 0 END) AS incomeCount,
      SUM(CASE WHEN type = 'expense' THEN 1 ELSE 0 END) AS expenseCount`;
    const fields = `id, type, description, amount_cents AS amountCents,
      transaction_date AS transactionDate,
      COALESCE(NULLIF(transaction_time, ''), substr(created_at, 12, 5)) AS transactionTime, source`;
    const [monthly, daily, expenses] = await db.batch([
      db.prepare(`SELECT substr(transaction_date, 1, 7) AS month, ${aggregate}
        FROM transactions WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?
        GROUP BY substr(transaction_date, 1, 7) ORDER BY month`)
        .bind(user.id, `${period.months[0]}-01`, period.to),
      db.prepare(`SELECT transaction_date AS date, ${aggregate}
        FROM transactions WHERE user_id = ? AND transaction_date >= ? AND transaction_date <= ?
        GROUP BY transaction_date ORDER BY date`).bind(user.id, period.from, period.to),
      db.prepare(`SELECT ${fields} FROM transactions
        WHERE user_id = ? AND type = 'expense' AND transaction_date >= ? AND transaction_date <= ?
        ORDER BY amount_cents DESC, transaction_date DESC, id ASC LIMIT 5`)
        .bind(user.id, period.from, period.to),
    ]);
    const data = assembleOverview(
      period,
      monthly.results as (OverviewTotals & { month: string })[],
      daily.results as { date: string; incomeCents: number; expenseCents: number }[],
      expenses.results as OverviewTransaction[],
    );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
