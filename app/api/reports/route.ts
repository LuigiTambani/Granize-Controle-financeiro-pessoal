import { ApiError, errorResponse, getD1, requireApiUser } from "../_lib/server";

type ReportRow = { type: "income" | "expense"; description: string; amountCents: number; transactionDate: string; transactionTime: string; source: string };

function csvCell(value: string) { return `"${value.replace(/"/g, '""')}"`; }
function money(cents: number) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100); }
function html(value: string) { return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]!); }

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const params = new URL(request.url).searchParams;
    const from = params.get("from") || "";
    const to = params.get("to") || "";
    const format = params.get("format") || "csv";
    if ((from && !/^\d{4}-\d{2}-\d{2}$/.test(from)) || (to && !/^\d{4}-\d{2}-\d{2}$/.test(to))) throw new ApiError(400, "Período inválido.");
    const { results } = await getD1().prepare(`SELECT type, description, amount_cents AS amountCents,
      transaction_date AS transactionDate,
      COALESCE(NULLIF(transaction_time, ''), substr(created_at, 12, 5)) AS transactionTime,
      source FROM transactions
      WHERE user_id = ? AND (? = '' OR transaction_date >= ?) AND (? = '' OR transaction_date <= ?)
      ORDER BY transaction_date DESC, transaction_time DESC, created_at DESC`).bind(user.id, from, from, to, to).all<ReportRow>();
    const income = results.filter((row) => row.type === "income").reduce((sum, row) => sum + Number(row.amountCents), 0);
    const expense = results.filter((row) => row.type === "expense").reduce((sum, row) => sum + Number(row.amountCents), 0);
    if (format === "html") {
      const rows = results.map((row) => `<tr><td>${html(row.transactionDate.split("-").reverse().join("/"))}</td><td>${html(row.transactionTime || "--:--")}</td><td>${html(row.description)}</td><td>${row.type === "income" ? "Receita" : "Despesa"}</td><td>${html(row.source === "whatsapp" ? "WhatsApp" : "Manual")}</td><td class="${row.type}">${html(money(Number(row.amountCents)))}</td></tr>`).join("");
      const document = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório Granize</title><style>body{font:14px Arial;color:#10263a;margin:40px}header{display:flex;justify-content:space-between;align-items:end;border-bottom:3px solid #19c98b;padding-bottom:18px}h1{margin:0}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:15px;margin:24px 0}.summary div{padding:16px;border:1px solid #dfe8e5;border-radius:10px}.summary b{display:block;font-size:20px;margin-top:7px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid #e2e9e6;text-align:left}th{background:#f4f8f6}.income{color:#07865f}.expense{color:#c54e55}.actions{margin-bottom:20px}@media print{.actions{display:none}body{margin:18px}}</style></head><body><div class="actions"><button onclick="window.print()">Salvar como PDF / Imprimir</button></div><header><div><small>GRANIZE</small><h1>Relatório financeiro</h1></div><span>${html(from || "Início")} a ${html(to || "Hoje")}</span></header><section class="summary"><div>Receitas<b class="income">${html(money(income))}</b></div><div>Despesas<b class="expense">${html(money(expense))}</b></div><div>Saldo<b>${html(money(income - expense))}</b></div></section><table><thead><tr><th>Data</th><th>Hora</th><th>Descrição</th><th>Tipo</th><th>Origem</th><th>Valor</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Nenhum lançamento neste período.</td></tr>'}</tbody></table></body></html>`;
      return new Response(document, { headers: { "Content-Type": "text/html; charset=utf-8", "Content-Disposition": "inline; filename=relatorio-granize.html" } });
    }
    const lines = ["Data;Hora;Descrição;Tipo;Origem;Valor (R$)", ...results.map((row) => [row.transactionDate.split("-").reverse().join("/"), row.transactionTime || "--:--", csvCell(row.description), row.type === "income" ? "Receita" : "Despesa", row.source === "whatsapp" ? "WhatsApp" : "Manual", (Number(row.amountCents) / 100).toFixed(2).replace(".", ",")].join(";"))];
    return new Response(`\uFEFF${lines.join("\r\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="granize-${from || "inicio"}-${to || "hoje"}.csv"` } });
  } catch (error) { return errorResponse(error); }
}
