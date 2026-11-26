import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import { overviewPeriod } from "../app/lib/overview.ts";

test("dashboard consulta todos os registros e isola os dados de cada usuário", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`CREATE TABLE transactions (id TEXT, user_id TEXT, type TEXT, description TEXT,
    amount_cents INTEGER, transaction_date TEXT, transaction_time TEXT, created_at TEXT, source TEXT)`);
  const period = overviewPeriod();
  const insert = sqlite.prepare("INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (let index = 0; index < 250; index++) {
    insert.run(String(index), "first", "income", "Receita", 101, period.from, "10:30", `${period.from}T13:30:00Z`, "manual");
  }
  insert.run("expense", "first", "expense", "Compra", 505, period.to, "14:45", `${period.to}T17:45:00Z`, "whatsapp");
  insert.run("last-month", "first", "income", "Anterior", 777, `${period.previousMonth}-01`, "09:00", "2026-01-01T12:00:00Z", "manual");
  insert.run("outside", "first", "expense", "Fora do histórico", 999, "2000-01-01", "09:00", "2000-01-01T12:00:00Z", "manual");
  insert.run("private", "second", "income", "Outro usuário", 999999, period.from, "09:00", `${period.from}T12:00:00Z`, "manual");
  globalThis.__overviewTestDb = {
    prepare(sql) { return { bind(...params) { return { sql, params }; } }; },
    async batch(statements) { return statements.map(({ sql, params }) => ({ results: sqlite.prepare(sql).all(...params) })); },
  };
  const serverMock = `
    export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
    export function getD1() { return globalThis.__overviewTestDb; }
    export async function requireApiUser(request) {
      const id = request.headers.get('x-test-user');
      if (!id) throw new Error('Unauthorized');
      return { id };
    }
    export function errorResponse(error) { return Response.json({ error: error.message }, { status: error.status || 401 }); }
  `;
  const source = await readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('"../_lib/server"', JSON.stringify(`data:text/javascript;base64,${Buffer.from(serverMock).toString("base64")}`))
    .replace('"../../lib/overview"', JSON.stringify(new URL("../app/lib/overview.ts", import.meta.url).href));
  const { GET } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
  try {
    const response = await GET(new Request("http://localhost/api/dashboard", { headers: { "x-test-user": "first" } }));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const data = await response.json();
    assert.equal(data.totals.incomeCents, 25250);
    assert.equal(data.totals.expenseCents, 505);
    assert.equal(data.totals.incomeCount, 250);
    assert.equal(data.totals.expenseCount, 1);
    assert.equal(data.previous.incomeCents, 777);
    assert.equal(data.days.at(-1).balanceCents, 24745);
    assert.equal(data.transactions, undefined);
    assert.equal(data.topExpenses.length, 1);
    assert.equal(data.topExpenses[0].id, "expense");
    assert.equal(data.topExpenses[0].transactionTime, "14:45");
    assert.equal(data.topExpenses.some((row) => row.id === "private"), false);
    const selected = await GET(new Request(`http://localhost/api/dashboard?month=${period.previousMonth}`, { headers: { "x-test-user": "first" } }));
    const selectedData = await selected.json();
    assert.equal(selectedData.month, period.previousMonth);
    assert.equal(selectedData.totals.incomeCents, 777);
    assert.equal(selectedData.totals.expenseCents, 0);
    assert.equal(selectedData.days.at(-1).balanceCents, 777);
    assert.equal(selectedData.months.at(-1).month, period.previousMonth);
    assert.deepEqual(selectedData.topExpenses, []);
    const emptyMonth = "2024-02";
    const empty = await GET(new Request(`http://localhost/api/dashboard?month=${emptyMonth}`, { headers: { "x-test-user": "first" } }));
    const emptyData = await empty.json();
    assert.equal(emptyData.month, emptyMonth);
    assert.equal(emptyData.days.length, 29);
    assert.equal(emptyData.totals.incomeCents, 0);
    for (const value of ["", "2026-13", "2026-1", "invalid"]) {
      const invalid = await GET(new Request(`http://localhost/api/dashboard?month=${value}`, { headers: { "x-test-user": "first" } }));
      assert.equal(invalid.status, 400);
      assert.equal((await invalid.json()).error, "Escolha um mês válido.");
    }
    const second = await GET(new Request("http://localhost/api/dashboard", { headers: { "x-test-user": "second" } }));
    assert.equal((await second.json()).totals.incomeCents, 999999);
    assert.equal((await GET(new Request("http://localhost/api/dashboard"))).status, 401);
  } finally {
    delete globalThis.__overviewTestDb;
    sqlite.close();
  }
});
