import { ApiError, ensureSchema, errorResponse, getD1, runtimeString } from "../../_lib/server";
import { requireActiveWhatsAppAccess } from "../_lib/whatsapp-access";

type TransactionRow = {
  type: "income" | "expense";
  description: string;
  amountCents: number;
  transactionDate: string;
  transactionTime: string;
};

export async function GET(request: Request) {
  try {
    const expected = runtimeString("N8N_SHARED_SECRET");
    if (!expected || request.headers.get("x-granize-secret") !== expected) {
      throw new ApiError(401, "Integração não autorizada.");
    }

    const phone = new URL(request.url).searchParams.get("phone")?.trim() || "";
    if (!phone) throw new ApiError(400, "Telefone ausente.");
    await ensureSchema();

    const db = getD1();
    const access = await requireActiveWhatsAppAccess(phone);
    if (!access.allowed) throw new ApiError(access.reason === "not_linked" ? 404 : 403, access.reason === "not_linked" ? "WhatsApp não vinculado a uma conta." : "Assinatura inativa.");

    const now = new Date();
    const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-01`;
    const totals = await db.prepare(`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END), 0) AS incomeCents,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END), 0) AS expenseCents
      FROM transactions
      WHERE user_id = ? AND transaction_date >= ? AND transaction_date < ?
    `).bind(access.access.userId, start, end).first<{ incomeCents: number; expenseCents: number }>();
    const { results: recent = [] } = await db.prepare(`
      SELECT type, description, amount_cents AS amountCents, transaction_date AS transactionDate,
        COALESCE(NULLIF(transaction_time, ''), substr(created_at, 12, 5)) AS transactionTime
      FROM transactions
      WHERE user_id = ?
      ORDER BY transaction_date DESC, transaction_time DESC, created_at DESC
      LIMIT 5
    `).bind(access.access.userId).all<TransactionRow>();

    const incomeCents = Number(totals?.incomeCents) || 0;
    const expenseCents = Number(totals?.expenseCents) || 0;
    return Response.json({
      fullName: access.access.fullName,
      month: new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(now),
      incomeCents,
      expenseCents,
      balanceCents: incomeCents - expenseCents,
      recent,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
