"use client";

import { useId, useState } from "react";
import { isOverviewMonth, overviewPeriod, type OverviewData } from "../lib/overview";

function money(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(cents / 100);
}
function compact(cents: number) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(cents / 100);
}
function monthName(month: string, short = false) {
  return new Intl.DateTimeFormat("pt-BR", { month: short ? "short" : "long", year: short ? undefined : "numeric", timeZone: "UTC" })
    .format(new Date(`${month}-01T12:00:00Z`)).replace(".", "");
}
function dateName(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}
function change(current: number, previous: number) {
  if (!previous) return current ? "Sem base no mês anterior" : "Sem movimentação no mês anterior";
  const percent = ((current - previous) / previous) * 100;
  return `${percent > 0 ? "+" : ""}${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(percent)}% vs. mês anterior`;
}
function Icon({ name }: { name: "income" | "expense" | "savings" | "chart" }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {name === "income" && <><path d="M12 4v14m-5-5 5 5 5-5" /><path d="M4 19v2h16v-2" /></>}
    {name === "expense" && <><path d="M12 19V5m-5 5 5-5 5 5" /><path d="M4 19v2h16v-2" /></>}
    {name === "savings" && <><rect x="3" y="6" width="18" height="15" rx="3" /><path d="M3 10h18M7 6V3h10v3" /><path d="M12 13v5m-2-3h4" /></>}
    {name === "chart" && <><path d="M4 4v16h16M7 14l4-5 4 3 5-7" /></>}
  </svg>;
}
function Legend() {
  return <div className="finance-legend"><span><i className="legend-income" />Receitas</span><span><i className="legend-expense" />Despesas</span></div>;
}

function MonthlyChart({ data }: { data: OverviewData }) {
  const [selected, setSelected] = useState(5);
  const selectedMonth = data.months[selected];
  const peak = Math.max(...data.months.flatMap((item) => [item.incomeCents, item.expenseCents]), 10000);
  const max = Math.ceil(peak / 4 / 10000) * 4 * 10000;
  const width = 600, height = 220, left = 54, top = 16, bottom = 188, plotWidth = width - left - 10;
  const y = (amount: number) => bottom - (amount / max) * (bottom - top);
  return <article className="finance-card monthly-finance-card">
    <header className="finance-card-header">
      <div><h2>Receitas e despesas</h2><p>Seis meses até {monthName(data.month)}</p></div>
      <Legend />
    </header>
    <div className="monthly-chart-details" aria-live="polite">
      <b>{monthName(selectedMonth.month)}</b><span className="finance-income">{money(selectedMonth.incomeCents)}</span><span className="finance-expense">{money(selectedMonth.expenseCents)}</span>
    </div>
    <svg className="monthly-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Comparação de receitas e despesas dos últimos seis meses. Selecione um mês abaixo para consultar os valores.">
      {[0, 1, 2, 3, 4].map((tick) => <g key={tick}><line x1={left} x2={width - 10} y1={y(max * tick / 4)} y2={y(max * tick / 4)} stroke="#e4ece9" strokeDasharray={tick ? "4 5" : undefined} /><text x={left - 10} y={y(max * tick / 4) + 4} textAnchor="end" fill="#526775" fontSize="12">{compact(max * tick / 4)}</text></g>)}
      {data.months.map((item, index) => {
        const x = left + (plotWidth / 6) * (index + 0.5);
        return <g key={item.month} onPointerEnter={() => setSelected(index)}>
          {index === selected && <rect x={x - 34} y={top - 5} width="68" height={bottom - top + 5} fill="#f1f8f5" rx="8" />}
          <rect x={x - 23} y={y(item.incomeCents)} width="19" height={bottom - y(item.incomeCents)} rx="4" fill="#11b981"><title>{`${monthName(item.month)}: receitas ${money(item.incomeCents)}`}</title></rect>
          <rect x={x + 4} y={y(item.expenseCents)} width="19" height={bottom - y(item.expenseCents)} rx="4" fill="#ed7d63"><title>{`${monthName(item.month)}: despesas ${money(item.expenseCents)}`}</title></rect>
        </g>;
      })}
    </svg>
    <div className="monthly-chart-buttons" role="group" aria-label="Consultar valores por mês">
      {data.months.map((item, index) => <button key={item.month} aria-pressed={selected === index} onClick={() => setSelected(index)}>{monthName(item.month, true)}</button>)}
    </div>
    <p className="finance-footnote">Comparação com meses completos, incluindo lançamentos com data futura.</p>
  </article>;
}

function Distribution({ data }: { data: OverviewData }) {
  const income = data.totals.incomeCents, expense = data.totals.expenseCents;
  const total = income + expense;
  const incomePercent = total ? income / total * 100 : 0;
  const expensePercent = total ? 100 - incomePercent : 0;
  const percent = (value: number) => `${Math.round(value)}%`;
  const circumference = 2 * Math.PI * 72;
  return <article className="finance-card distribution-card">
    <header className="finance-card-header"><div><h2>Movimentação do mês</h2><p>O que entrou e o que saiu</p></div></header>
    <div className="finance-donut">
      <svg viewBox="0 0 200 200" role="img" aria-label={total ? `Receitas ${percent(incomePercent)} e despesas ${percent(expensePercent)} do total movimentado.` : "Ainda não há movimentações neste mês."}>
        <circle cx="100" cy="100" r="72" fill="none" stroke="#edf3f0" strokeWidth="22" />
        {total > 0 && <g transform="rotate(-90 100 100)"><circle cx="100" cy="100" r="72" fill="none" stroke="#ed7d63" strokeWidth="22" /><circle cx="100" cy="100" r="72" fill="none" stroke="#11b981" strokeWidth="22" strokeDasharray={`${circumference * incomePercent / 100} ${circumference}`} /></g>}
      </svg>
      <div><span>Total movimentado</span><strong>{money(total)}</strong><small>{data.totals.incomeCount + data.totals.expenseCount} lançamentos</small></div>
    </div>
    <div className="distribution-values">
      <div><span><i className="legend-income" />Receitas</span><strong>{money(income)}</strong><small>{percent(incomePercent)}</small></div>
      <div><span><i className="legend-expense" />Despesas</span><strong>{money(expense)}</strong><small>{percent(expensePercent)}</small></div>
    </div>
    {!total && <p className="finance-footnote">Nenhuma movimentação no mês selecionado.</p>}
  </article>;
}

function BalanceChart({ data }: { data: OverviewData }) {
  const today = Number(new Intl.DateTimeFormat("en", { day: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date()));
  const [selected, setSelected] = useState(data.month === overviewPeriod().month ? Math.min(today - 1, data.days.length - 1) : data.days.length - 1);
  const gradientId = useId().replace(/:/g, "");
  const values = [0, ...data.days.map((day) => day.balanceCents)];
  const min = Math.min(...values), max = Math.max(...values);
  const padding = Math.max((max - min) * 0.14, 10000);
  const low = min - padding, high = max + padding;
  const left = 64, right = 588, top = 18, bottom = 186;
  const x = (index: number) => left + index / Math.max(data.days.length - 1, 1) * (right - left);
  const y = (value: number) => bottom - (value - low) / (high - low) * (bottom - top);
  const line = data.days.map((day, index) => `${index ? "L" : "M"}${x(index)},${y(day.balanceCents)}`).join(" ");
  const area = `${line} L${right},${bottom} L${left},${bottom} Z`;
  const day = data.days[selected];
  return <article className="finance-card balance-chart-card">
    <header className="finance-card-header"><div><h2>Evolução do saldo</h2><p>Resultado acumulado no mês selecionado</p></div><span className="finance-icon"><Icon name="chart" /></span></header>
    <div className="balance-chart-details" aria-live="polite"><span>{dateName(day.date)}</span><strong className={day.balanceCents < 0 ? "finance-expense" : ""}>{money(day.balanceCents)}</strong><small>Entrou {money(day.incomeCents)} · Saiu {money(day.expenseCents)}</small></div>
    <svg className="balance-chart" viewBox="0 0 600 218" role="img" aria-label={`Saldo acumulado de ${monthName(data.month)}. Use o controle abaixo para consultar cada dia.`} onPointerMove={(event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const value = ((event.clientX - rect.left) / rect.width * 600 - left) / (right - left);
      setSelected(Math.max(0, Math.min(data.days.length - 1, Math.round(value * (data.days.length - 1)))));
    }}>
      <defs><linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#11b981" stopOpacity="0.23" /><stop offset="100%" stopColor="#11b981" stopOpacity="0.01" /></linearGradient></defs>
      {[0, 1, 2, 3].map((tick) => {
        const value = low + (high - low) * tick / 3;
        return <g key={tick}><line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#e4ece9" strokeDasharray="4 5" /><text x={left - 10} y={y(value) + 4} textAnchor="end" fill="#526775" fontSize="12">{compact(value)}</text></g>;
      })}
      <path d={area} fill={`url(#${gradientId})`} />
      <line x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="#c2d2ca" strokeDasharray="3 4" />
      <path d={line} fill="none" stroke="#079869" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      {[0, 7, 14, 21, data.days.length - 1].map((index) => <text key={index} x={x(index)} y="211" textAnchor="middle" fill="#526775" fontSize="12">{String(index + 1).padStart(2, "0")}</text>)}
      <line x1={x(selected)} x2={x(selected)} y1={top} y2={bottom} stroke="#8ebaaa" strokeDasharray="4 4" />
      <circle cx={x(selected)} cy={y(day.balanceCents)} r="6" fill="#079869" stroke="#fff" strokeWidth="3" />
    </svg>
    <label className="balance-day-selector"><span>Consultar dia <b>{selected + 1}</b></span><input type="range" min="0" max={data.days.length - 1} value={selected} onChange={(event) => setSelected(Number(event.target.value))} aria-label="Dia para consultar o saldo" aria-valuetext={`${dateName(day.date)}, saldo ${money(day.balanceCents)}`} /></label>
  </article>;
}

function LargestExpenses({ data, onViewAll }: { data: OverviewData; onViewAll: () => void }) {
  return <article className="finance-card largest-expenses-card">
    <header className="finance-card-header"><div><h2>Maiores despesas</h2><p>Os lançamentos que mais pesaram no mês</p></div></header>
    {data.topExpenses.length ? <ol className="largest-expenses-list">{data.topExpenses.map((expense, index) => <li key={expense.id}>
      <span className="expense-rank">{String(index + 1).padStart(2, "0")}</span>
      <div><div className="largest-expense-title"><b>{expense.description}</b><strong>{money(expense.amountCents)}</strong></div><div className="largest-expense-track"><i style={{ width: `${expense.amountCents / data.topExpenses[0].amountCents * 100}%` }} /></div><small>{dateName(expense.transactionDate)} · {new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(expense.amountCents / data.totals.expenseCents * 100)}% das despesas</small></div>
    </li>)}</ol> : <div className="finance-chart-empty"><span><Icon name="expense" /></span><h3>Nenhuma despesa no período</h3><p>Selecione outro mês ou registre uma despesa.</p></div>}
    <button className="finance-text-button" onClick={onViewAll}>Ver todos os lançamentos <span aria-hidden="true">→</span></button>
  </article>;
}

export function OverviewMonthSelector({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  function shiftMonth(offset: number) {
    const shifted = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + offset, 1)).toISOString().slice(0, 7);
    if (isOverviewMonth(shifted)) onChange(shifted);
  }
  return <div className="overview-section-heading">
    <h2>Um olhar sobre seu mês</h2>
    <div className="overview-month-controls" role="group" aria-label="Selecionar mês do painel">
      <button type="button" className="overview-month-arrow" aria-label="Mês anterior" onClick={() => shiftMonth(-1)} disabled={month === "1000-01"}>‹</button>
      <label className="overview-month">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18" /></svg>
        <input type="month" aria-label="Mês do painel" value={month} min="1000-01" max="9999-12" onChange={(event) => { if (isOverviewMonth(event.target.value)) onChange(event.target.value); }} />
      </label>
      <button type="button" className="overview-month-arrow" aria-label="Próximo mês" onClick={() => shiftMonth(1)} disabled={month === "9999-12"}>›</button>
    </div>
  </div>;
}

export default function FinancialOverview({ data, loading, budget, onProfile, onAdd, onViewAll }: {
  data: OverviewData | null;
  loading: boolean;
  budget: number;
  onProfile: () => void;
  onAdd: () => void;
  onViewAll: () => void;
}) {
  if (!data) return <div className="overview-skeleton" role="status"><div /><div /><div /><p>{loading ? "Preparando seu painel financeiro…" : "Os gráficos aparecerão quando os dados estiverem disponíveis."}</p></div>;
  const { totals, previous } = data;
  const balance = totals.incomeCents - totals.expenseCents;
  const totalCount = totals.incomeCount + totals.expenseCount;
  const savingsRate = totals.incomeCents ? balance / totals.incomeCents * 100 : null;
  const budgetPercent = budget ? totals.expenseCents / budget * 100 : 0;
  const budgetExceeded = budget > 0 && totals.expenseCents > budget;
  const monthlyBalances = data.months.map((month) => month.incomeCents - month.expenseCents);
  const lowest = Math.min(...monthlyBalances), highest = Math.max(...monthlyBalances);
  const trendLine = monthlyBalances.map((value, index) => `${index ? "L" : "M"}${index * 52},${highest === lowest ? 30 : 55 - (value - lowest) / (highest - lowest) * 50}`).join(" ");
  return <div className="financial-overview" aria-busy={loading}>
    <section className="overview-balance">
      <div><span>Saldo do mês</span><strong>{money(balance)}</strong><p>Receitas menos despesas · {totalCount} lançamentos</p><span className={`overview-result ${balance < 0 ? "negative" : ""}`}>{!totalCount ? "Sem movimentações no período" : balance > 0 ? "Saldo positivo neste período" : balance < 0 ? "As despesas superaram as receitas" : "Receitas e despesas equilibradas"}</span></div>
      <div className="overview-balance-aside"><span>Uma visão completa</span><p>Saldo dos últimos 6 meses.<br />Cada passo fica mais claro.</p><svg viewBox="0 0 260 60" aria-hidden="true"><path d={trendLine} stroke="#3de1aa" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg></div>
    </section>
    <section className="overview-metrics" aria-label="Indicadores do mês">
      <article className="overview-metric"><div><span className="finance-icon income"><Icon name="income" /></span><h3>Receitas</h3></div><strong>{money(totals.incomeCents)}</strong><p>{totals.incomeCount} {totals.incomeCount === 1 ? "entrada registrada" : "entradas registradas"}</p><small>{change(totals.incomeCents, previous.incomeCents)}</small></article>
      <article className="overview-metric"><div><span className="finance-icon expense"><Icon name="expense" /></span><h3>Despesas</h3></div><strong>{money(totals.expenseCents)}</strong><p>{totals.expenseCount} {totals.expenseCount === 1 ? "saída registrada" : "saídas registradas"}</p><small>{change(totals.expenseCents, previous.expenseCents)}</small></article>
      <article className="overview-metric"><div><span className="finance-icon savings"><Icon name="savings" /></span><h3>Quanto sobrou</h3></div><strong className={balance < 0 ? "finance-expense" : ""}>{savingsRate === null ? "—" : `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(savingsRate)}%`}</strong><p>{savingsRate === null ? "Registre uma receita para calcular" : balance < 0 ? "Suas despesas estão acima da renda" : "da sua receita ficou disponível"}</p><small>{savingsRate === null ? "O indicador considera este mês" : balance < 0 ? `Faltaram ${money(-balance)} no mês` : `${money(balance)} após as despesas`}</small></article>
    </section>
    {!totalCount && <div className="overview-first-step"><div><b>Seu próximo passo é simples</b><p>Registre uma receita ou despesa para dar vida aos gráficos.</p></div><button className="button primary" onClick={onAdd}>Adicionar lançamento <span aria-hidden="true">+</span></button></div>}
    <section className="overview-chart-grid" aria-label="Gráficos financeiros"><MonthlyChart key={`months-${data.month}`} data={data} /><Distribution data={data} /><BalanceChart key={`days-${data.month}`} data={data} /><LargestExpenses data={data} onViewAll={onViewAll} /></section>
    <section className={`overview-budget ${budgetExceeded ? "exceeded" : ""}`} aria-label="Orçamento mensal">
      <span className="finance-icon savings"><Icon name="savings" /></span>
      <div><h2>{budget ? "Seu orçamento do mês" : "Dê um limite aos seus gastos"}</h2><p>{budget ? `${money(totals.expenseCents)} gastos de ${money(budget)} planejados` : "Defina um orçamento no perfil e acompanhe quanto ainda pode gastar."}</p>{budget > 0 && <div className="overview-budget-track" role="progressbar" aria-label="Orçamento utilizado" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round(budgetPercent))} aria-valuetext={`${Math.round(budgetPercent)}% utilizado`}><i style={{ width: `${Math.min(100, budgetPercent)}%` }} /></div>}</div>
      {budget > 0 ? <div className="overview-budget-value"><strong>{Math.round(budgetPercent)}% utilizado</strong><span>{budgetExceeded ? `${money(totals.expenseCents - budget)} acima do orçamento` : `${money(budget - totals.expenseCents)} ainda disponíveis`}</span><button className="finance-text-button" onClick={onProfile}>Ajustar orçamento →</button></div> : <button className="button soft" onClick={onProfile}>Definir orçamento →</button>}
    </section>
  </div>;
}
