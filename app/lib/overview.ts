export type OverviewTotals = {
  incomeCents: number;
  expenseCents: number;
  incomeCount: number;
  expenseCount: number;
};
export type OverviewTransaction = {
  id: string;
  type: "income" | "expense";
  description: string;
  amountCents: number;
  transactionDate: string;
  transactionTime: string;
  source: "manual" | "whatsapp";
};
export type OverviewData = {
  month: string;
  from: string;
  to: string;
  totals: OverviewTotals;
  previous: OverviewTotals;
  months: (OverviewTotals & { month: string })[];
  days: { date: string; incomeCents: number; expenseCents: number; balanceCents: number }[];
  topExpenses: OverviewTransaction[];
};

export function isOverviewMonth(value: string) {
  return /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value);
}

export function overviewPeriod(now = new Date(), selectedMonth?: string) {
  if (selectedMonth !== undefined && !isOverviewMonth(selectedMonth)) {
    throw new RangeError("Escolha um mês válido.");
  }
  const month = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit",
  }).formatToParts(now);
  const year = selectedMonth ? Number(selectedMonth.slice(0, 4)) : Number(month.find((part) => part.type === "year")!.value);
  const index = (selectedMonth ? Number(selectedMonth.slice(5, 7)) : Number(month.find((part) => part.type === "month")!.value)) - 1;
  const key = (offset: number) => new Date(Date.UTC(year, index + offset, 1)).toISOString().slice(0, 7);
  const current = key(0);
  return {
    month: current,
    from: `${current}-01`,
    to: new Date(Date.UTC(year, index + 1, 0)).toISOString().slice(0, 10),
    previousMonth: key(-1),
    months: Array.from({ length: 6 }, (_, i) => key(i - 5)),
    dayCount: new Date(Date.UTC(year, index + 1, 0)).getUTCDate(),
  };
}

type Aggregate = Partial<OverviewTotals>;
export function normalizeTotals(row?: Aggregate): OverviewTotals {
  return {
    incomeCents: Number(row?.incomeCents || 0),
    expenseCents: Number(row?.expenseCents || 0),
    incomeCount: Number(row?.incomeCount || 0),
    expenseCount: Number(row?.expenseCount || 0),
  };
}

export function assembleOverview(
  period: ReturnType<typeof overviewPeriod>,
  monthly: (Aggregate & { month: string })[],
  daily: { date: string; incomeCents: number; expenseCents: number }[],
  topExpenses: OverviewTransaction[],
): OverviewData {
  const months = period.months.map((month) => ({
    month, ...normalizeTotals(monthly.find((row) => row.month === month)),
  }));
  let balanceCents = 0;
  const days = Array.from({ length: period.dayCount }, (_, i) => {
    const date = `${period.month}-${String(i + 1).padStart(2, "0")}`;
    const row = daily.find((item) => item.date === date);
    const incomeCents = Number(row?.incomeCents || 0);
    const expenseCents = Number(row?.expenseCents || 0);
    balanceCents += incomeCents - expenseCents;
    return { date, incomeCents, expenseCents, balanceCents };
  });
  return {
    month: period.month, from: period.from, to: period.to,
    totals: normalizeTotals(months[5]),
    previous: normalizeTotals(months[4]),
    months, days, topExpenses,
  };
}
