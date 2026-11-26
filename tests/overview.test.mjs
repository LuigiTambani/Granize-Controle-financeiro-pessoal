import assert from "node:assert/strict";
import test from "node:test";
import { assembleOverview, isOverviewMonth, overviewPeriod } from "../app/lib/overview.ts";

test("usa o mês de São Paulo mesmo na virada do mês em UTC", () => {
  const period = overviewPeriod(new Date("2026-11-01T01:30:00Z"));
  assert.equal(period.month, "2026-10");
  assert.equal(period.from, "2026-10-01");
  assert.equal(period.to, "2026-10-31");
  assert.deepEqual(period.months, ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
});

test("o histórico atravessa anos e respeita fevereiro em ano bissexto", () => {
  const period = overviewPeriod(new Date("2024-02-15T12:00:00Z"));
  assert.equal(period.to, "2024-02-29");
  assert.equal(period.dayCount, 29);
  assert.equal(period.months[0], "2023-09");
});

test("conta sem dados apresenta meses e dias zerados sem dados fictícios", () => {
  const data = assembleOverview(overviewPeriod(new Date("2026-10-07T12:00:00Z")), [], [], []);
  assert.equal(data.months.length, 6);
  assert.equal(data.days.length, 31);
  assert.equal(data.totals.incomeCents, 0);
  assert.equal(data.days[30].balanceCents, 0);
  assert.deepEqual(data.topExpenses, []);
});

test("preenche dias sem movimento e mantém centavos e saldo negativo", () => {
  const data = assembleOverview(overviewPeriod(new Date("2026-10-07T12:00:00Z")), [
    { month: "2026-10", incomeCents: 10001, expenseCents: 12555, incomeCount: 1, expenseCount: 1 },
  ], [
    { date: "2026-10-01", incomeCents: 10001, expenseCents: 0 },
    { date: "2026-10-03", incomeCents: 0, expenseCents: 12555 },
  ], []);
  assert.equal(data.days[0].balanceCents, 10001);
  assert.equal(data.days[1].balanceCents, 10001);
  assert.equal(data.days[2].balanceCents, -2554);
  assert.equal(data.days[30].balanceCents, -2554);
  assert.equal(data.days[30].balanceCents, data.totals.incomeCents - data.totals.expenseCents);
});

test("totais e contagens abrangem mais de 200 lançamentos sem uma lista de recentes", () => {
  const data = assembleOverview(overviewPeriod(new Date("2026-10-07T12:00:00Z")), [
    { month: "2026-09", incomeCents: 10000, expenseCents: 3000, incomeCount: 10, expenseCount: 3 },
    { month: "2026-10", incomeCents: 25000, expenseCents: 5000, incomeCount: 250, expenseCount: 50 },
  ], [], []);
  assert.equal(data.transactions, undefined);
  assert.equal(data.totals.incomeCount + data.totals.expenseCount, 300);
  assert.equal(data.totals.incomeCents, 25000);
  assert.equal(data.previous.incomeCents, 10000);
  assert.equal(data.months[0].incomeCents, 0);
});

test("seleção de mês recalcula período e histórico independentemente da data atual", () => {
  const period = overviewPeriod(new Date("2026-10-07T12:00:00Z"), "2024-02");
  assert.equal(period.month, "2024-02");
  assert.equal(period.dayCount, 29);
  assert.equal(period.to, "2024-02-29");
  assert.equal(period.previousMonth, "2024-01");
  assert.deepEqual(period.months, ["2023-09", "2023-10", "2023-11", "2023-12", "2024-01", "2024-02"]);
  assert.equal(overviewPeriod(new Date(), "2025-02").dayCount, 28);
  assert.equal(overviewPeriod(new Date(), "2026-01").previousMonth, "2025-12");
});

test("seleção de mês rejeita parâmetros incompletos ou inválidos", () => {
  for (const value of ["", "2026-00", "2026-13", "2026-2", "2026-02-01", "2026-12x", "abc", "0000-01"]) {
    assert.equal(isOverviewMonth(value), false);
    assert.throws(() => overviewPeriod(new Date(), value), RangeError);
  }
});
