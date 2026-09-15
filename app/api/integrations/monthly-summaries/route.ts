import { ApiError, ensureSchema, errorResponse, getD1, runtimeString } from "../../_lib/server";

type SummaryRow = {
  email: string;
  fullName: string;
  preferredSummaryDay: number;
  incomeCents: number;
  expenseCents: number;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] || character);
}

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
}

function dateRange(now: Date) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const start = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const next = new Date(year, month + 1, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}

export async function GET(request: Request) {
  try {
    const expected = runtimeString("N8N_SHARED_SECRET");
    if (!expected || request.headers.get("x-granize-secret") !== expected) {
      throw new ApiError(401, "Integração não autorizada.");
    }

    await ensureSchema();
    const now = new Date();
    const today = now.getDate();
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const { start, end } = dateRange(now);
    const { results = [] } = await getD1().prepare(`
      SELECT
        users.email,
        users.full_name AS fullName,
        users.preferred_summary_day AS preferredSummaryDay,
        COALESCE(SUM(CASE WHEN transactions.type = 'income' THEN transactions.amount_cents ELSE 0 END), 0) AS incomeCents,
        COALESCE(SUM(CASE WHEN transactions.type = 'expense' THEN transactions.amount_cents ELSE 0 END), 0) AS expenseCents
      FROM users
      LEFT JOIN transactions
        ON transactions.user_id = users.id
        AND transactions.transaction_date >= ?
        AND transactions.transaction_date < ?
      WHERE users.profile_completed = 1 AND users.email_notifications = 1
      GROUP BY users.id, users.email, users.full_name, users.preferred_summary_day
    `).bind(start, end).all<SummaryRow>();

    const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(now);
    const summaries = results
      .filter((row) => Number(row.preferredSummaryDay) === today || (today === lastDay && Number(row.preferredSummaryDay) > today))
      .map((row) => {
        const name = row.fullName.trim().split(/\s+/)[0] || "Olá";
        const income = Number(row.incomeCents) || 0;
        const expense = Number(row.expenseCents) || 0;
        const balance = income - expense;
        const subject = `Seu resumo financeiro de ${monthName} — Granize`;
        const text = `${name}, este é o seu resumo de ${monthName}. Receitas: ${money(income)}. Despesas: ${money(expense)}. Saldo: ${money(balance)}.`;
        const html = `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f2f7f5;font-family:Arial,sans-serif;color:#071f35"><div style="max-width:560px;margin:32px auto;background:#fff;border-radius:18px;overflow:hidden"><div style="background:#071f35;padding:24px 30px;color:#fff;font-size:24px;font-weight:800">GRANI<span style="color:#19cb91">ZE</span></div><div style="padding:30px"><h1 style="font-size:24px;margin:0 0 10px">Olá, ${escapeHtml(name)}!</h1><p style="color:#486174;line-height:1.6">Seu resumo financeiro de ${escapeHtml(monthName)} está pronto.</p><table style="width:100%;border-collapse:collapse;margin:24px 0"><tr><td style="padding:14px;background:#ecfbf6">Receitas</td><td style="padding:14px;background:#ecfbf6;text-align:right;font-weight:700;color:#07885e">${money(income)}</td></tr><tr><td style="padding:14px">Despesas</td><td style="padding:14px;text-align:right;font-weight:700;color:#b45309">${money(expense)}</td></tr><tr><td style="padding:14px;background:#071f35;color:#fff">Saldo</td><td style="padding:14px;background:#071f35;color:#fff;text-align:right;font-weight:800">${money(balance)}</td></tr></table><p style="font-size:13px;color:#607586">Este resumo foi enviado porque você ativou os avisos por e-mail no seu perfil.</p></div></div></body></html>`;
        return { email: row.email, name: row.fullName || name, subject, text, html };
      });

    return Response.json({ summaries, generatedAt: now.toISOString() });
  } catch (error) {
    return errorResponse(error);
  }
}
