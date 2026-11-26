"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Brand from "./components/Brand";
import FinancialOverview, { OverviewMonthSelector } from "./components/FinancialOverview";
import ShoppingList from "./components/ShoppingList";
import CommandExamples from "./components/CommandExamples";
import BillingPanel, { CheckoutConfirmation } from "./components/BillingPanel";
import { isPaidPlan, paidPlans, type BillingStatus } from "./lib/billing";
import { isOverviewMonth, overviewPeriod, type OverviewData } from "./lib/overview";

type View = "landing" | "auth" | "plans" | "dashboard";
type DashboardTab = "overview" | "transactions" | "shopping" | "reports" | "profile";
type TransactionType = "income" | "expense";
type PlanId = "trial" | "basic" | "pro" | "annual";
type Transaction = {
  id: string;
  type: TransactionType;
  description: string;
  amountCents: number;
  transactionDate: string;
  transactionTime: string;
  source: "manual" | "whatsapp";
};
type WhatsAppConnection = {
  instanceName: string;
  status: string;
  phone: string | null;
};
type WhatsAppLink = { phone: string; verifiedAt: string };
type Profile = {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  hasAvatar: number;
  avatarVersion: string;
  birthDate: string;
  country: string;
  currency: string;
  financialGoal: string;
  preferredSummaryDay: number;
  monthlyBudgetCents: number;
  emailNotifications: number;
  browserNotifications: number;
  onboardingCompleted: number;
  profileCompleted: number;
  termsAcceptedAt: string | null;
  privacyAcceptedAt: string | null;
};
type Session = {
  authenticated: boolean;
  localAuth?: boolean;
  appAuth?: boolean;
  profile?: Profile;
  whatsapp?: WhatsAppConnection | null;
  whatsappLink?: WhatsAppLink | null;
  subscription?: {
    plan: string;
    status: string;
    currentPeriodEnd: string | null;
  };
  integrations?: { evolution: boolean; n8n: boolean; stripe: boolean };
  billing?: BillingStatus;
};
type Period = { preset: string; from: string; to: string; label: string };

const plans = [
  {
    id: "trial",
    name: "Grátis",
    price: "0",
    cycle: "para sempre",
    note: "Sem prazo para acabar",
    features: [
      "Acesso completo ao painel",
      "Lançamentos e relatórios",
      "Não precisa de cartão",
    ],
  },
  {
    id: "basic",
    name: "Básico",
    price: (paidPlans.basic.amountCents / 100).toFixed(2).replace(".", ","),
    cycle: "/mês",
    note: "Para começar com tranquilidade",
    features: [
      "100 lançamentos mensais",
      "Dashboard e relatórios",
      "Registro manual e por WhatsApp",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: (paidPlans.pro.amountCents / 100).toFixed(2).replace(".", ","),
    cycle: "/6 meses",
    note: "O melhor equilíbrio",
    features: [
      "Lançamentos ilimitados",
      "Evolution API + n8n",
      "Suporte prioritário",
    ],
  },
  {
    id: "annual",
    name: "Anual",
    price: (paidPlans.annual.amountCents / 100).toFixed(2).replace(".", ","),
    cycle: "/ano",
    note: "Maior economia",
    features: ["Tudo do plano Pro", "12 meses de acesso", "Economia no ano"],
  },
] as const;

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
function monthPeriod(offset = 0): Period {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return {
    preset: offset === 0 ? "month" : "previous",
    from: iso(start),
    to: iso(end),
    label: offset === 0 ? "Este mês" : "Mês anterior",
  };
}
function presetPeriod(preset: string): Period {
  const today = new Date();
  if (preset === "month") return monthPeriod();
  if (preset === "previous") return monthPeriod(-1);
  if (preset === "90days") {
    const start = new Date(today);
    start.setDate(start.getDate() - 89);
    return {
      preset,
      from: iso(start),
      to: iso(today),
      label: "Últimos 90 dias",
    };
  }
  if (preset === "year")
    return {
      preset,
      from: `${today.getFullYear()}-01-01`,
      to: `${today.getFullYear()}-12-31`,
      label: "Este ano",
    };
  return { preset: "all", from: "", to: "", label: "Todo o período" };
}
function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00Z`));
}
function currentTimeValue() {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}
function amountValue(value: string) {
  return Number(
    value
      .replace(/\s/g, "")
      .replace(/\.(?=\d{3}(?:\D|$))/g, "")
      .replace(",", "."),
  );
}
function phoneValue(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
function queryPeriod(period: Period) {
  const params = new URLSearchParams();
  if (period.from) params.set("from", period.from);
  if (period.to) params.set("to", period.to);
  return params.toString();
}
async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: string;
  };
  if (!response.ok)
    throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload;
}
function Landing({
  onLogin,
  onPlans,
}: {
  onLogin: () => void;
  onPlans: () => void;
}) {
  return (
    <main className="landing-page">
      <section className="reference-landing">
      <img
        className="reference-visual"
        src="/hero-granize.png"
        alt="Painel Granize com saldo, receitas, despesas e lançamento pelo WhatsApp"
      />
      <nav className="landing-nav">
        <span />
        <div>
          <button className="nav-login" onClick={onLogin}>
            Entrar
          </button>
          <button className="nav-plan" onClick={onPlans}>
            Escolher plano
          </button>
        </div>
      </nav>
      <section className="reference-copy">
        <div className="reference-brand">
          <Brand hero />
        </div>
        <i className="reference-line" />
        <h1>
          Controle financeiro
          <br />
          na palma da sua mão.
        </h1>
        <p>
          Registre receitas e despesas, acompanhe seu saldo e mantenha sua vida
          financeira organizada pelo painel ou pelo WhatsApp.
        </p>
        <div className="reference-actions">
          <button className="button primary" onClick={onPlans}>
            Escolher plano <span>→</span>
          </button>
          <button className="button soft" onClick={onLogin}>
            Já tenho uma conta
          </button>
        </div>
        <div className="trust-row">
          <span>
            <b>✓</b> Simples de usar
          </span>
          <span>
            <b>✓</b> Dados protegidos
          </span>
          <span>
            <b>✓</b> Integrado ao WhatsApp
          </span>
        </div>
      </section>
      </section>
      <CommandExamples />
      <footer className="landing-footer">
        <span>Granize · Controle financeiro pessoal</span>
        <nav aria-label="Informações e suporte">
          <a href="/termos">Termos de Uso</a>
          <a href="/privacidade">Privacidade</a>
          <a href="mailto:luigi.mywork@gmail.com">Fale com a gente</a>
        </nav>
      </footer>
    </main>
  );
}

function Auth({
  mode,
  selectedPlan,
  onDone,
  onBack,
  onChoosePlan,
  refresh,
}: {
  mode: "register" | "login";
  selectedPlan: PlanId;
  onDone: () => void;
  onBack: () => void;
  onChoosePlan: () => void;
  refresh: () => Promise<Session>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    const code = new URLSearchParams(window.location.search).get("google");
    if (code === "not_configured") return "O login com Google ainda está sendo configurado. Você pode entrar usando seu e-mail e senha.";
    if (code === "failed") return "Não foi possível entrar com o Google. Tente novamente ou use seu e-mail e senha.";
    return "";
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/auth/${mode === "register" ? "register" : "login"}`, {
        method: "POST",
        body: JSON.stringify({ fullName: name, email, password, plan: selectedPlan }),
      });
      const updatedSession = await refresh();
      if (!updatedSession.authenticated) throw new Error("Não foi possível iniciar a sessão. Tente entrar novamente.");
      onDone();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Falha ao entrar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="flow-page">
      <button className="back-link" onClick={onBack}>
        ← Voltar
      </button>
      <section className="auth-layout">
        <div className="flow-intro">
          <Brand />
          <h1>
            {mode === "register"
              ? "Crie sua conta"
              : "Que bom ter você de volta"}
          </h1>
          <p>
            Seus dados protegidos. Sua vida financeira só para você.
          </p>
          {mode === "register" && (
            <div className="security-note">
              <span>⌁</span>
              <div>
                <b>
                  Plano escolhido:{" "}
                  {plans.find((plan) => plan.id === selectedPlan)?.name}
                </b>
                <small>
                  Você poderá alterar suas informações e preferências dentro do
                  perfil.
                </small>
              </div>
            </div>
          )}
        </div>
        <form className="auth-panel" onSubmit={submit}>
          <h2>{mode === "register" ? "Vamos começar" : "Acesse seu painel"}</h2>
          <p>
            {mode === "register"
              ? "Preencha seus dados para criar seu espaço financeiro."
              : "Use o e-mail e a senha cadastrados."}
          </p>
          <a
            className="google-auth-button"
            href={`/api/auth/google/start?mode=${mode}&plan=${selectedPlan}`}
          >
            <img src="/google-g.png" alt="" aria-hidden="true" />
            {mode === "register"
              ? "Criar conta com Google"
              : "Continuar com Google"}
          </a>
          <div className="auth-divider">
            <span>ou use seu e-mail</span>
          </div>
          {mode === "register" && (
            <label>
              Nome completo
              <input
                required
                minLength={2}
                name="name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Como devemos chamar você?"
              />
            </label>
          )}
          <label>
            E-mail
            <input
              required
              type="email"
              name="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@exemplo.com"
            />
          </label>
          <label>
              Senha
              <div className="password-field">
                <input
                  required
                  minLength={8}
                  maxLength={128}
                  name="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder={
                    mode === "register" ? "Mínimo de 8 caracteres" : "Sua senha"
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
          </label>
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          <button className="button primary full" disabled={busy}>
            {busy
              ? "Aguarde..."
              : mode === "register"
                ? "Criar conta e continuar"
                : "Entrar na Granize"}{" "}
            <span>→</span>
          </button>
          {mode === "login" && (
            <button
              type="button"
              className="choose-plan-link"
              onClick={onChoosePlan}
            >
              Ainda não tem conta? Escolha um plano
            </button>
          )}
        </form>
      </section>
    </main>
  );
}

function Plans({
  session,
  selected,
  setSelected,
  onBack,
  onNeedAccount,
  onDashboard,
  paymentCancelled = false,
}: {
  session: Session | null;
  selected: PlanId;
  setSelected: (plan: PlanId) => void;
  onBack: () => void;
  onNeedAccount: () => void;
  onDashboard: () => void;
  paymentCancelled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accountReady = Boolean(session?.authenticated && session.profile);
  const stripeReady = Boolean(session?.integrations?.stripe);
  const isTrial = selected === "trial";
  async function checkout() {
    if (!accountReady) {
      onNeedAccount();
      return;
    }
    if (isTrial) {
      onDashboard();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<{ checkoutUrl: string }>("/api/checkout", {
        method: "POST",
        body: JSON.stringify({ plan: selected }),
      });
      window.location.href = result.checkoutUrl;
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Falha ao abrir o pagamento.",
      );
      setBusy(false);
    }
  }
  return (
    <main className="plans-page">
      <button className="back-link" onClick={onBack}>
        ← Voltar
      </button>
      <header>
        <Brand />
        <span className="eyebrow">
          <i /> Escolha antes do cadastro
        </span>
        <h1>Escolha o plano ideal</h1>
        <p>
          O plano Grátis não vence e não precisa de cartão. Nos planos pagos,
          o pagamento acontece em uma página segura. A Granize não recebe nem
          armazena os dados do seu cartão.
        </p>
      </header>
      {paymentCancelled && <p className="billing-cancelled" role="status">Você saiu do pagamento. Seu plano atual foi mantido e o plano Grátis continua disponível.</p>}
      <section className="plans-grid">
        {plans.map((plan) => (
          <button
            key={plan.id}
            className={`plan-card ${selected === plan.id ? "selected" : ""}`}
            onClick={() => setSelected(plan.id)}
          >
            {plan.id === "trial" && (
              <span className="popular free">SEM PRAZO</span>
            )}
            {plan.id === "pro" && (
              <span className="popular">MAIS ESCOLHIDO</span>
            )}
            <div className="plan-choice">
              <i>{selected === plan.id ? "✓" : ""}</i>
              <span>
                <b>{plan.name}</b>
                <small>{plan.note}</small>
              </span>
            </div>
            <div className="plan-price">
              <strong>R$ {plan.price}</strong>
              <span>{plan.cycle}</span>
            </div>
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>✓ {feature}</li>
              ))}
            </ul>
          </button>
        ))}
      </section>
      <section className="checkout-bar">
        <div>
          <span
            className={`status-pill ${isTrial || !accountReady ? "ready" : stripeReady ? "ok" : "waiting"}`}
          >
            {isTrial
              ? "● Grátis para sempre, sem cartão"
              : stripeReady
                ? "● Pagamento seguro"
                : "● Pagamento em configuração"}
          </span>
          <h2>Plano {plans.find((plan) => plan.id === selected)?.name}</h2>
          <p>
            {!accountReady
              ? "A criação da conta acontece na próxima etapa."
              : isTrial
                ? "Use sem pagar e sem prazo para acabar. Você só assina um plano pago se quiser."
                : stripeReady
                  ? "Você será direcionado para confirmar a assinatura recorrente. É possível cancelar pelo perfil."
                  : "Os planos pagos estarão disponíveis quando o pagamento for configurado."}
          </p>
        </div>
        <div className="checkout-actions">
          {error && <small>{error}</small>}
          <button
            className="button primary"
            disabled={busy || (!isTrial && accountReady && !stripeReady)}
            onClick={checkout}
          >
            {busy
              ? "Abrindo..."
              : !accountReady
                ? "Escolher e criar conta"
                : isTrial
                  ? "Abrir meu painel"
                  : "Continuar para pagamento"}{" "}
            <span>→</span>
          </button>
        </div>
      </section>
    </main>
  );
}

function TransactionModal({
  transaction,
  onClose,
  onSaved,
}: {
  transaction: Transaction | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [type, setType] = useState<TransactionType>(
    transaction?.type || "expense",
  );
  const [description, setDescription] = useState(
    transaction?.description || "",
  );
  const [amount, setAmount] = useState(
    transaction
      ? (transaction.amountCents / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [date, setDate] = useState(
    transaction?.transactionDate || iso(new Date()),
  );
  const [time, setTime] = useState(
    transaction?.transactionTime || currentTimeValue(),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        transaction
          ? `/api/transactions/${transaction.id}`
          : "/api/transactions",
        {
          method: transaction ? "PUT" : "POST",
          body: JSON.stringify({
            type,
            description,
            amount: amountValue(amount),
            transactionDate: date,
            transactionTime: time,
          }),
        },
      );
      await onSaved();
      onClose();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={save} role="dialog" aria-modal="true">
        <button type="button" className="modal-close" onClick={onClose}>
          ×
        </button>
        <span className="eyebrow">
          <i /> Granize
        </span>
        <h2>{transaction ? "Editar lançamento" : "Novo lançamento"}</h2>
        <p>Informe os dados essenciais do lançamento.</p>
        <div className="type-switch">
          <button
            type="button"
            className={type === "expense" ? "active expense" : ""}
            onClick={() => setType("expense")}
          >
            ↑ Despesa
          </button>
          <button
            type="button"
            className={type === "income" ? "active income" : ""}
            onClick={() => setType("income")}
          >
            ↓ Receita
          </button>
        </div>
        <label>
          Descrição
          <input
            required
            maxLength={120}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </label>
        <div className="modal-row transaction-fields">
          <label>
            Valor (R$)
            <input
              required
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0,00"
            />
          </label>
          <label>
            Data
            <input
              required
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            Hora
            <input
              required
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="button primary full" disabled={busy}>
          {busy ? "Salvando..." : "Salvar lançamento"}
        </button>
      </form>
    </div>
  );
}

function PeriodFilter({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  const [custom, setCustom] = useState(period.preset === "custom");
  return (
    <div className="period-filter">
      <label>
        <span>Período</span>
        <select
          value={custom ? "custom" : period.preset}
          onChange={(event) => {
            const value = event.target.value;
            setCustom(value === "custom");
            if (value !== "custom") onChange(presetPeriod(value));
          }}
        >
          <option value="month">Este mês</option>
          <option value="previous">Mês anterior</option>
          <option value="90days">Últimos 90 dias</option>
          <option value="year">Este ano</option>
          <option value="all">Todo o período</option>
          <option value="custom">Personalizado</option>
        </select>
      </label>
      {custom && (
        <div className="custom-period">
          <input
            aria-label="Data inicial"
            type="date"
            value={period.from}
            onChange={(event) =>
              onChange({
                preset: "custom",
                from: event.target.value,
                to: period.to,
                label: "Período personalizado",
              })
            }
          />
          <span>até</span>
          <input
            aria-label="Data final"
            type="date"
            value={period.to}
            onChange={(event) =>
              onChange({
                preset: "custom",
                from: period.from,
                to: event.target.value,
                label: "Período personalizado",
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function ProfileAvatar({
  profile,
  preview,
  size = "large",
}: {
  profile: Profile;
  preview?: string;
  size?: "small" | "large";
}) {
  const source =
    preview ||
    (profile.hasAvatar
      ? `/api/profile/photo?v=${encodeURIComponent(profile.avatarVersion || profile.id)}`
      : "");
  return (
    <div className={`profile-avatar ${size}`}>
      {source ? (
        <img src={source} alt="Foto de perfil" />
      ) : (
        <span>
          {(profile.fullName || profile.email).slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function ProfileForm({
  session,
  completion = false,
  onSaved,
}: {
  session: Session;
  completion?: boolean;
  onSaved: () => Promise<Session>;
}) {
  const profile = session.profile!;
  const [name, setName] = useState(profile.fullName || "");
  const [phone, setPhone] = useState(phoneValue(profile.phone || ""));
  const [birthDate, setBirthDate] = useState(profile.birthDate || "");
  const [country, setCountry] = useState(profile.country || "Brasil");
  const [currency, setCurrency] = useState(profile.currency || "BRL");
  const [goal, setGoal] = useState(profile.financialGoal || "");
  const [summaryDay, setSummaryDay] = useState(
    String(profile.preferredSummaryDay || 1),
  );
  const [budget, setBudget] = useState(
    profile.monthlyBudgetCents
      ? (profile.monthlyBudgetCents / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [browserNotifications, setBrowserNotifications] = useState(
    Boolean(profile.browserNotifications),
  );
  const [emailNotifications, setEmailNotifications] = useState(
    Boolean(profile.emailNotifications),
  );
  const [acceptTerms, setAcceptTerms] = useState(
    Boolean(profile.termsAcceptedAt),
  );
  const [acceptPrivacy, setAcceptPrivacy] = useState(
    Boolean(profile.privacyAcceptedAt),
  );
  const [preview, setPreview] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  async function choosePhoto(file?: File) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Use uma foto JPG, PNG ou WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("A foto deve ter no máximo 2 MB.");
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setAvatarBusy(true);
    setMessage("");
    setError("");
    try {
      const form = new FormData();
      form.set("photo", file);
      const response = await fetch("/api/profile/photo", {
        method: "PUT",
        body: form,
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok)
        throw new Error(result.error || "Não foi possível salvar a foto.");
      await onSaved();
      setPreview("");
      setMessage(
        "Foto salva. Ela já aparece no seu perfil e ao lado do seu nome.",
      );
    } catch (reason) {
      setPreview("");
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível salvar a foto.",
      );
    } finally {
      setAvatarBusy(false);
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      if (
        browserNotifications &&
        "Notification" in window &&
        Notification.permission === "default"
      )
        await Notification.requestPermission();
      await api("/api/me", {
        method: "POST",
        body: JSON.stringify({
          fullName: name,
          phone,
          birthDate,
          country,
          currency,
          financialGoal: goal,
          preferredSummaryDay: Number(summaryDay),
          monthlyBudget: budget ? amountValue(budget) : 0,
          browserNotifications,
          emailNotifications,
          completeProfile: completion,
          acceptTerms,
          acceptPrivacy,
        }),
      });
      await onSaved();
      setPreview("");
      setMessage(
        completion
          ? "Cadastro concluído. Seu perfil está liberado."
          : "Perfil atualizado com sucesso.",
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`settings-card profile-form ${completion ? "completion-form" : ""}`}
      onSubmit={save}
    >
      <div className="profile-form-heading">
        <ProfileAvatar profile={profile} preview={preview} />
        <div>
          <span className="eyebrow">
            <i /> {completion ? "Cadastro complementar" : "Dados pessoais"}
          </span>
          <h2>{completion ? "Complete seu cadastro" : "Seu perfil"}</h2>
          <p>
            {completion
              ? "Os campos marcados são necessários para liberar o perfil."
              : "Mantenha seus dados e preferências sempre atualizados."}
          </p>
        </div>
      </div>
      <div className="photo-actions">
        <label
          className={`button soft photo-button ${avatarBusy ? "disabled" : ""}`}
        >
          {avatarBusy ? "Salvando foto..." : "Escolher foto"}
          <input
            disabled={avatarBusy}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void choosePhoto(event.target.files?.[0])}
          />
        </label>
        <small>
          {avatarBusy
            ? "Aguarde enquanto a foto é salva."
            : "A foto é salva automaticamente · JPG, PNG ou WebP · até 2 MB"}
        </small>
      </div>
      <div className="profile-fields">
        <label>
          Nome completo *
          <input
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          E-mail
          <input value={profile.email} readOnly />
        </label>
        <label>
          Telefone com DDD *
          <input
            required
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(event) => setPhone(phoneValue(event.target.value))}
            placeholder="(00) 00000-0000"
          />
        </label>
        <label>
          Data de nascimento <small>Opcional</small>
          <input
            type="date"
            max={iso(new Date())}
            value={birthDate}
            onChange={(event) => setBirthDate(event.target.value)}
          />
        </label>
        <label>
          País
          <select
            value={country}
            onChange={(event) => setCountry(event.target.value)}
          >
            <option>Brasil</option>
            <option>Portugal</option>
            <option>Estados Unidos</option>
            <option>Outro</option>
          </select>
        </label>
        <label>
          Moeda principal
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
          >
            <option value="BRL">Real brasileiro (R$)</option>
            <option value="USD">Dólar americano (US$)</option>
            <option value="EUR">Euro (€)</option>
          </select>
        </label>
        <label>
          Orçamento mensal <small>Opcional</small>
          <input
            inputMode="decimal"
            value={budget}
            onChange={(event) => setBudget(event.target.value)}
            placeholder="0,00"
          />
        </label>
        <label>
          Dia do resumo mensal
          <select
            value={summaryDay}
            onChange={(event) => setSummaryDay(event.target.value)}
          >
            {Array.from({ length: 28 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                Dia {index + 1}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Meta financeira principal <small>Opcional</small>
        <textarea
          maxLength={240}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          placeholder="Ex.: montar uma reserva de emergência de R$ 10.000"
        />
      </label>
      <div className="preference-grid">
        <label className="toggle-row">
          <input
            aria-label="Notificações no navegador"
            type="checkbox"
            checked={browserNotifications}
            onChange={(event) => setBrowserNotifications(event.target.checked)}
          />
          <span>
            <b>Avisos no navegador</b>
            <small>Lembretes enquanto o Granize estiver aberto.</small>
          </span>
        </label>
        <label className="toggle-row">
          <input
            aria-label="Notificações por e-mail"
            type="checkbox"
            checked={emailNotifications}
            onChange={(event) => setEmailNotifications(event.target.checked)}
          />
          <span>
            <b>Resumo por e-mail</b>
            <small>Receba novidades e seu resumo financeiro.</small>
          </span>
        </label>
      </div>
      {completion && (
        <div className="consent-box">
          <label>
            <input
              required
              type="checkbox"
              checked={acceptTerms}
              onChange={(event) => setAcceptTerms(event.target.checked)}
            />
            <span>
              Li e aceito os{" "}
              <a href="/termos" target="_blank">
                Termos de Uso
              </a>
              .
            </span>
          </label>
          <label>
            <input
              required
              type="checkbox"
              checked={acceptPrivacy}
              onChange={(event) => setAcceptPrivacy(event.target.checked)}
            />
            <span>
              Li a{" "}
              <a href="/privacidade" target="_blank">
                Política de Privacidade
              </a>{" "}
              e entendi como meus dados são utilizados.
            </span>
          </label>
        </div>
      )}
      {message && <div className="success-message">{message}</div>}
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      <button className="button primary" disabled={busy || avatarBusy}>
        {busy
          ? "Salvando..."
          : completion
            ? "Concluir cadastro"
            : "Salvar alterações"}
      </button>
    </form>
  );
}

function CompleteProfileCard({
  onComplete,
  locked = false,
}: {
  onComplete: () => void;
  locked?: boolean;
}) {
  return (
    <section className={`complete-profile-card ${locked ? "locked" : ""}`}>
      <div className="complete-profile-icon">◎</div>
      <div>
        <span>{locked ? "PERFIL BLOQUEADO" : "FALTA POUCO"}</span>
        <h2>
          {locked
            ? "Complete seu cadastro para acessar o perfil"
            : "Complete seu cadastro"}
        </h2>
        <p>
          Adicione seu telefone e suas preferências para personalizar sua
          experiência e liberar todas as opções do perfil.
        </p>
      </div>
      <button className="button primary" onClick={onComplete}>
        Completar cadastro <b>→</b>
      </button>
    </section>
  );
}

function ProfilePanel({
  session,
  onSaved,
  onExit,
  onPlans,
}: {
  session: Session;
  onSaved: () => Promise<Session>;
  onExit: () => Promise<void>;
  onPlans: () => void;
}) {
  return (
    <section className="profile-panel">
      <ProfileForm session={session} onSaved={onSaved} />
      <BillingPanel initial={session.billing} onRefresh={onSaved} onPlans={onPlans} />
      <footer className="profile-footer">
        <div>
          <h3>Conta e privacidade</h3>
          <div className="privacy-links">
            <a href="/termos" target="_blank">
              Termos de Uso
            </a>
            <a href="/privacidade" target="_blank">
              Política de Privacidade
            </a>
          </div>
        </div>
        <div className="account-exit">
          <button
            className="button account-exit-button"
            onClick={() => void onExit()}
          >
            ↗ Desconectar da conta
          </button>
          <small>Você poderá entrar novamente usando seu e-mail e senha.</small>
        </div>
      </footer>
    </section>
  );
}

function whatsAppConnected(connection: WhatsAppConnection | null) {
  return ["open", "connected", "online"].includes(
    connection?.status?.toLowerCase() || "",
  );
}

function WhatsAppCard({
  configured,
  botConnected,
  linked,
  onConnect,
}: {
  configured: boolean;
  botConnected: boolean;
  linked: boolean;
  onConnect: () => void;
}) {
  return (
    <section className={`whatsapp-connect-card ${linked ? "linked" : ""}`}>
      <div className="whatsapp-logo">
        <img src="/whatsapp-logo.svg" alt="WhatsApp" />
      </div>
      <div>
        <span>{linked ? "ASSISTENTE ATIVO" : "LIBERE O ASSISTENTE"}</span>
        <h2>
          {linked
            ? "Seu WhatsApp está conectado"
            : "Conecte seu número ao bot Granize"}
        </h2>
        <p>
          {linked
            ? "Envie textos ou áudios para registrar lançamentos e consultar seu saldo."
            : "Você receberá um QR Code exclusivo e temporário. Depois, poderá registrar receitas e despesas por texto ou áudio."}
        </p>
      </div>
      <button className="button whatsapp-button" onClick={onConnect}>
        {linked
          ? "Gerenciar WhatsApp"
          : !configured
            ? "Ver configuração"
            : botConnected
              ? "Gerar meu QR Code"
              : "Conectar bot oficial"}{" "}
        <b>→</b>
      </button>
    </section>
  );
}

function WhatsAppConnectModal({
  configured,
  initialConnection,
  initialLink,
  onClose,
  onChanged,
}: {
  configured: boolean;
  initialConnection: WhatsAppConnection | null;
  initialLink: WhatsAppLink | null;
  onClose: () => void;
  onChanged: (
    connection: WhatsAppConnection | null,
    link: WhatsAppLink | null,
  ) => void;
}) {
  const [connection, setConnection] = useState(initialConnection);
  const [link, setLink] = useState(initialLink);
  const [deviceQrCode, setDeviceQrCode] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [personalQrCode, setPersonalQrCode] = useState<string | null>(null);
  const [personalCode, setPersonalCode] = useState<string | null>(null);
  const [whatsappUrl, setWhatsappUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connected = whatsAppConnected(connection);
  const refresh = useCallback(async () => {
    try {
      const [botResult, linkResult] = await Promise.all([
        api<{ connection: WhatsAppConnection | null }>(
          "/api/evolution/instance",
        ),
        api<{ linked: boolean; link: WhatsAppLink | null }>(
          "/api/whatsapp/link",
        ),
      ]);
      setConnection(botResult.connection);
      setLink(linkResult.link);
      onChanged(botResult.connection, linkResult.link);
    } catch {
      /* mantém o último estado conhecido */
    }
  }, [onChanged]);
  useEffect(() => {
    void refresh();
    if (!configured || link) return;
    const timer = window.setInterval(() => void refresh(), 3500);
    return () => window.clearInterval(timer);
  }, [configured, link, refresh]);
  async function connectBot() {
    setBusy(true);
    setError("");
    try {
      const result = await api<{
        instanceName: string;
        status: string;
        qrCode: string | null;
        pairingCode: string | null;
      }>("/api/evolution/instance", { method: "POST", body: "{}" });
      const next = {
        instanceName: result.instanceName,
        status: result.status,
        phone: null,
      };
      setConnection(next);
      setDeviceQrCode(result.qrCode);
      setPairingCode(result.pairingCode);
      onChanged(next, link);
      if (!result.qrCode && !result.pairingCode)
        setError(
          "O QR Code ainda não ficou disponível. Aguarde alguns segundos e tente novamente.",
        );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível gerar o QR Code do bot oficial.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function createPersonalQr() {
    setBusy(true);
    setError("");
    try {
      type PersonalQrResult = {
        linked: boolean;
        link?: WhatsAppLink;
        code?: string;
        whatsappUrl?: string;
        qrCode?: string;
      };
      const requestQrCode = () =>
        api<PersonalQrResult>("/api/whatsapp/link", {
          method: "POST",
          body: "{}",
        });
      let result: PersonalQrResult;
      try {
        result = await requestQrCode();
      } catch (firstError) {
        const transient =
          firstError instanceof Error &&
          /network connection lost|conexão.*perdida/i.test(firstError.message);
        if (!transient) throw firstError;
        await new Promise((resolve) => window.setTimeout(resolve, 500));
        result = await requestQrCode();
      }
      if (result.linked && result.link) {
        setLink(result.link);
        onChanged(connection, result.link);
        return;
      }
      setPersonalQrCode(result.qrCode || null);
      setPersonalCode(result.code || null);
      setWhatsappUrl(result.whatsappUrl || null);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "";
      setError(
        /network connection lost|conexão.*perdida/i.test(message)
          ? "A conexão foi interrompida. Aguarde um instante e tente gerar novamente."
          : message || "Não foi possível gerar seu QR Code.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disconnectNumber() {
    setBusy(true);
    setError("");
    try {
      await api("/api/whatsapp/link", { method: "DELETE" });
      setLink(null);
      setPersonalQrCode(null);
      setPersonalCode(null);
      setWhatsappUrl(null);
      onChanged(connection, null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível desconectar o número.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="modal-backdrop whatsapp-modal-backdrop">
      <section
        className="modal whatsapp-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Conectar WhatsApp"
      >
        <button type="button" className="modal-close" onClick={onClose}>
          ×
        </button>
        <div className="whatsapp-modal-heading">
          <div className="whatsapp-logo large">
            <img src="/whatsapp-logo.svg" alt="" />
          </div>
          <div>
            <span>ASSISTENTE GRANIZE</span>
            <h2>
              {link
                ? "WhatsApp liberado"
                : connected
                  ? "Vincule seu número"
                  : "Conectar bot oficial"}
            </h2>
            <p>
              {link
                ? "Seu número está autorizado a usar o assistente financeiro."
                : connected
                  ? "Este QR é exclusivo, expira rapidamente e não solicita sua senha."
                  : "Esta etapa conecta o único número oficial que atenderá todos os assinantes."}
            </p>
          </div>
        </div>
        {link ? (
          <div className="whatsapp-success">
            <span>✓</span>
            <h3>Seu número está conectado</h3>
            <p>
              WhatsApp autorizado: <strong>+{link.phone}</strong>. Já pode
              enviar lançamentos por texto ou áudio.
            </p>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <div className="whatsapp-success-actions">
              <button className="button whatsapp-button" onClick={onClose}>
                Concluir
              </button>
              <button
                className="button soft"
                disabled={busy}
                onClick={() => void disconnectNumber()}
              >
                {busy ? "Desconectando..." : "Desconectar número"}
              </button>
            </div>
          </div>
        ) : !configured ? (
          <div className="whatsapp-unavailable">
            <span>⌁</span>
            <h3>Conexão em configuração</h3>
            <p>
              A integração ainda não está disponível. Assim que os serviços
              estiverem ativos, o QR Code aparecerá aqui.
            </p>
            <button className="button soft" onClick={onClose}>
              Entendi
            </button>
          </div>
        ) : !connected ? (
          <div className="whatsapp-qr-layout">
            <div className={`whatsapp-qr ${deviceQrCode ? "ready" : ""}`}>
              {deviceQrCode ? (
                <img
                  src={deviceQrCode}
                  alt="QR Code para conectar o número oficial da Granize"
                />
              ) : (
                <>
                  <div className="whatsapp-logo large">
                    <img src="/whatsapp-logo.svg" alt="" />
                  </div>
                  <b>Bot oficial ainda desconectado</b>
                  <small>
                    Gere o código e leia em Dispositivos conectados.
                  </small>
                </>
              )}
            </div>
            <div className="whatsapp-steps">
              <h3>Conecte uma única vez</h3>
              <ol>
                <li>
                  <b>1</b>
                  <span>Abra o WhatsApp do número oficial.</span>
                </li>
                <li>
                  <b>2</b>
                  <span>
                    Acesse <strong>Dispositivos conectados</strong>.
                  </span>
                </li>
                <li>
                  <b>3</b>
                  <span>
                    Toque em <strong>Conectar dispositivo</strong> e leia o
                    código.
                  </span>
                </li>
              </ol>
              {pairingCode && (
                <div className="pairing-code">
                  <small>Código alternativo</small>
                  <b>{pairingCode}</b>
                </div>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              <button
                className="button whatsapp-button full"
                disabled={busy}
                onClick={() => void connectBot()}
              >
                {busy
                  ? "Gerando..."
                  : deviceQrCode
                    ? "Gerar novo QR Code"
                    : "Gerar QR Code do bot"}
              </button>
            </div>
          </div>
        ) : (
          <div className="whatsapp-qr-layout">
            <div className={`whatsapp-qr ${personalQrCode ? "ready" : ""}`}>
              {personalQrCode ? (
                <img
                  src={personalQrCode}
                  alt="QR Code exclusivo para vincular sua conta Granize"
                />
              ) : (
                <>
                  <div className="whatsapp-logo large">
                    <img src="/whatsapp-logo.svg" alt="" />
                  </div>
                  <b>Seu QR Code exclusivo</b>
                  <small>Válido por 10 minutos e apenas uma utilização.</small>
                </>
              )}
            </div>
            <div className="whatsapp-steps">
              <h3>Libere seu acesso</h3>
              <ol>
                <li>
                  <b>1</b>
                  <span>Gere seu QR Code exclusivo.</span>
                </li>
                <li>
                  <b>2</b>
                  <span>Leia o código ou abra a conversa no WhatsApp.</span>
                </li>
                <li>
                  <b>3</b>
                  <span>Envie a mensagem pronta para concluir o vínculo.</span>
                </li>
              </ol>
              {personalCode && (
                <div className="pairing-code">
                  <small>Seu código temporário</small>
                  <b>{personalCode}</b>
                </div>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
              {whatsappUrl && (
                <a
                  className="button whatsapp-button full whatsapp-open-link"
                  href={whatsappUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir conversa no WhatsApp
                </a>
              )}
              <button
                className="button soft full"
                disabled={busy}
                onClick={() => void createPersonalQr()}
              >
                {busy
                  ? "Gerando..."
                  : personalQrCode
                    ? "Gerar novo código"
                    : "Gerar meu QR Code"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function TransactionPanel({
  title,
  loading,
  transactions,
  total,
  onAdd,
  onEdit,
  onRemove,
  onViewAll,
}: {
  title: string;
  loading: boolean;
  transactions: Transaction[];
  total: number;
  onAdd: () => void;
  onEdit: (transaction: Transaction) => void;
  onRemove: (transaction: Transaction) => void;
  onViewAll?: () => void;
}) {
  return (
    <section className="transactions-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <p>
            {loading ? "Atualizando dados..." : `${total} registros no período`}
          </p>
        </div>
        {onViewAll && total > transactions.length && (
          <button onClick={onViewAll}>Ver todos →</button>
        )}
      </div>
      {loading ? (
        <div className="loading-state">
          <i />
          <span>Carregando seus dados...</span>
        </div>
      ) : transactions.length === 0 ? (
        <div className="empty-state">
          <span>↕</span>
          <h3>Nenhum lançamento neste período</h3>
          <p>Adicione uma receita ou despesa para começar seu controle.</p>
          <button className="button primary" onClick={onAdd}>
            Adicionar lançamento
          </button>
        </div>
      ) : (
        <div className="transaction-list">
          {transactions.map((transaction) => (
            <article key={transaction.id}>
              <span className={`transaction-type ${transaction.type}`}>
                {transaction.type === "income" ? "↓" : "↑"}
              </span>
              <div className="transaction-main">
                <b>{transaction.description}</b>
                <small>
                  {formatDate(transaction.transactionDate)} às {transaction.transactionTime || "--:--"} ·{" "}
                  {transaction.source === "whatsapp" ? "WhatsApp" : "Manual"}
                </small>
              </div>
              <strong className={transaction.type}>
                {transaction.type === "expense" ? "- " : "+ "}
                {formatMoney(transaction.amountCents)}
              </strong>
              <div className="row-actions">
                <button
                  onClick={() => onEdit(transaction)}
                  aria-label={`Editar ${transaction.description}`}
                >
                  ✎
                </button>
                <button
                  className="danger"
                  onClick={() => onRemove(transaction)}
                  aria-label={`Excluir ${transaction.description}`}
                >
                  ⌫
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Dashboard({
  session,
  refreshSession,
  onExit,
  startProfileCompletion = false,
  onPlans,
  checkoutSessionId,
  onCheckoutClose,
}: {
  session: Session;
  refreshSession: () => Promise<Session>;
  onExit: () => Promise<void>;
  startProfileCompletion?: boolean;
  onPlans: () => void;
  checkoutSessionId?: string | null;
  onCheckoutClose: () => void;
}) {
  const [tab, setTab] = useState<DashboardTab>("overview");
  const [period, setPeriod] = useState<Period>(monthPeriod());
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState({ incomeCents: 0, expenseCents: 0 });
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [overviewMonth, setOverviewMonth] = useState(() => overviewPeriod().month);
  const requestSequence = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Transaction | null | undefined>(
    undefined,
  );
  const [completingProfile, setCompletingProfile] = useState(
    startProfileCompletion && !session.profile?.profileCompleted,
  );
  const [connectingWhatsApp, setConnectingWhatsApp] = useState(false);
  const [whatsappConnection, setWhatsappConnection] =
    useState<WhatsAppConnection | null>(session.whatsapp || null);
  const [whatsappLink, setWhatsappLink] = useState<WhatsAppLink | null>(
    session.whatsappLink || null,
  );
  const loadTransactions = useCallback(async (quiet = false) => {
    const requestId = ++requestSequence.current;
    if (!quiet) setLoading(true);
    setError("");
    try {
      if (tab === "overview") {
        const data = await api<OverviewData>(`/api/dashboard?month=${encodeURIComponent(overviewMonth)}`);
        if (requestId !== requestSequence.current) return;
        setOverview(data);
        setSummary(data.totals);
        return;
      }
      if (tab === "shopping") return;
      const selectedPeriod = period;
      const result = await api<{
        transactions: Transaction[];
        summary: { incomeCents: number; expenseCents: number };
      }>(`/api/transactions?${queryPeriod(selectedPeriod)}`);
      if (requestId !== requestSequence.current) return;
      setTransactions(result.transactions);
      setSummary({
        incomeCents: Number(result.summary.incomeCents),
        expenseCents: Number(result.summary.expenseCents),
      });
    } catch (reason) {
      if (requestId !== requestSequence.current) return;
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar os dados.",
      );
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [overviewMonth, period, tab]);
  useEffect(() => {
    const requests = requestSequence;
    void loadTransactions();
    if (tab !== "overview") return () => { requests.current++; };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadTransactions(true);
    }, 30000);
    const onFocus = () => void loadTransactions(true);
    window.addEventListener("focus", onFocus);
    return () => {
      requests.current++;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadTransactions, tab]);
  useEffect(() => {
    setWhatsappConnection(session.whatsapp || null);
    setWhatsappLink(session.whatsappLink || null);
  }, [session.whatsapp, session.whatsappLink]);
  function selectOverviewMonth(month: string) {
    if (!isOverviewMonth(month) || month === overviewMonth) return;
    requestSequence.current++;
    setOverviewMonth(month);
    setOverview(null);
    setLoading(true);
    setError("");
  }
  const balance = summary.incomeCents - summary.expenseCents;
  const firstName = session.profile?.fullName?.split(" ")[0] || "Usuário";
  const budget = Number(session.profile?.monthlyBudgetCents || 0);
  const profileComplete = Boolean(session.profile?.profileCompleted);
  async function remove(transaction: Transaction) {
    if (!window.confirm(`Excluir “${transaction.description}”?`)) return;
    try {
      await api(`/api/transactions/${transaction.id}`, { method: "DELETE" });
      await loadTransactions();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Não foi possível excluir.",
      );
    }
  }
  const handleWhatsAppChanged = useCallback(
    (connection: WhatsAppConnection | null, link: WhatsAppLink | null) => {
      setWhatsappConnection(connection);
      setWhatsappLink(link);
      if (link || whatsAppConnected(connection)) void refreshSession();
    },
    [refreshSession],
  );
  function openReport(format: "csv" | "html") {
    const params = new URLSearchParams(queryPeriod(period));
    params.set("format", format);
    if (format === "html")
      window.open(`/api/reports?${params}`, "_blank", "noopener,noreferrer");
    else {
      const link = document.createElement("a");
      link.href = `/api/reports?${params}`;
      link.download = "relatorio-granize.csv";
      link.click();
    }
  }
  const headings: Record<DashboardTab, [string, string]> = {
    overview: [`Olá, ${firstName}`, ""],
    transactions: [
      "Seus lançamentos",
      "Cadastre, filtre, edite ou exclua receitas e despesas.",
    ],
    reports: [
      "Relatórios financeiros",
      "Exporte os dados do período selecionado.",
    ],
    profile: ["Perfil do usuário", "Atualize seus dados e preferências."],
    shopping: ["Lista de compras", "Organize os produtos que faltam em casa."],
  };
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Brand inverse />
        <nav>
          {(
            ["overview", "transactions", "shopping", "reports", "profile"] as DashboardTab[]
          ).map((item) => {
            const labels = {
              overview: ["⌂", "Visão geral"],
              transactions: ["↕", "Lançamentos"],
              shopping: ["☷", "Lista de compras"],
              reports: ["▤", "Relatórios"],
              profile: ["◎", "Perfil"],
            };
            return (
              <button
                key={item}
                className={tab === item ? "active" : ""}
                onClick={() => setTab(item)}
              >
                <span>{labels[item][0]}</span>
                {labels[item][1]}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <ProfileAvatar profile={session.profile!} size="small" />
          <span>
            <b>{session.profile?.fullName || firstName}</b>
            <small>
              {session.subscription?.plan === "trial"
                ? "Plano Grátis"
                : session.subscription?.status === "active"
                  ? `Plano ${plans.find((plan) => plan.id === session.subscription?.plan)?.name || session.subscription.plan}`
                  : "Assinatura pendente"}
            </small>
          </span>
          <button onClick={() => void onExit()} aria-label="Sair">
            ↗
          </button>
        </div>
      </aside>
      <section className="app-content">
        <header className="topbar">
          <div>
            <span className="mobile-brand">
              <Brand />
            </span>
            <h1>{headings[tab][0]}</h1>
            {headings[tab][1] && <p>{headings[tab][1]}</p>}
          </div>
          <div className="top-actions">
            {(tab === "overview" || tab === "transactions") && (
              <button
                className="button primary compact"
                onClick={() => setEditing(null)}
              >
                ＋ Novo lançamento
              </button>
            )}
          </div>
        </header>
        <div className="dashboard-body">
          {checkoutSessionId && <CheckoutConfirmation sessionId={checkoutSessionId} onRefresh={refreshSession} onClose={onCheckoutClose} />}
          {error && (
            <div className="page-error">
              <span>!</span>
              {error}
              <button onClick={() => setError("")}>×</button>
            </div>
          )}
          {tab === "overview" && (
            <>
              {!profileComplete && (
                <CompleteProfileCard
                  onComplete={() => setCompletingProfile(true)}
                />
              )}
              {profileComplete && !whatsappLink && (
                <WhatsAppCard
                  configured={Boolean(session.integrations?.evolution)}
                  botConnected={whatsAppConnected(whatsappConnection)}
                  linked={false}
                  onConnect={() => setConnectingWhatsApp(true)}
                />
              )}
              <OverviewMonthSelector month={overviewMonth} onChange={selectOverviewMonth} />
              <FinancialOverview
                data={overview}
                loading={loading}
                budget={budget}
                onProfile={() => setTab("profile")}
                onAdd={() => setEditing(null)}
                onViewAll={() => {
                  if (overview) setPeriod({ preset: "custom", from: overview.from, to: overview.to, label: "Mês selecionado" });
                  setTab("transactions");
                }}
              />
            </>
          )}
          {tab === "transactions" && (
            <>
              <PeriodFilter period={period} onChange={setPeriod} />
              <TransactionPanel
                title="Todos os lançamentos"
                loading={loading}
                transactions={transactions}
                total={transactions.length}
                onAdd={() => setEditing(null)}
                onEdit={setEditing}
                onRemove={remove}
              />
            </>
          )}
          {tab === "reports" && (
            <>
              <PeriodFilter period={period} onChange={setPeriod} />
              <section className="reports-grid">
                <article className="report-card featured">
                  <span>▤</span>
                  <div>
                    <small>RESUMO DO PERÍODO</small>
                    <h2>{period.label}</h2>
                    <p>
                      {transactions.length} lançamentos · Saldo de{" "}
                      {formatMoney(balance)}
                    </p>
                  </div>
                </article>
                <article className="report-card">
                  <span>↓</span>
                  <h3>Planilha CSV</h3>
                  <p>
                    Abra os lançamentos no Excel com data, descrição, tipo,
                    origem e valor.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => openReport("csv")}
                  >
                    Baixar planilha
                  </button>
                </article>
                <article className="report-card">
                  <span>▧</span>
                  <h3>Relatório em PDF</h3>
                  <p>
                    Abra a versão pronta para impressão e escolha “Salvar como
                    PDF”.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => openReport("html")}
                  >
                    Baixar PDF
                  </button>
                </article>
                <article className="report-breakdown">
                  <h3>Conferência antes de exportar</h3>
                  <div>
                    <span>
                      Receitas
                      <b className="income-text">
                        {formatMoney(summary.incomeCents)}
                      </b>
                    </span>
                    <span>
                      Despesas
                      <b className="expense-text">
                        {formatMoney(summary.expenseCents)}
                      </b>
                    </span>
                    <span>
                      Saldo<b>{formatMoney(balance)}</b>
                    </span>
                  </div>
                  <p>
                    Os arquivos serão gerados exatamente com o período selecionado acima.
                  </p>
                </article>
              </section>
            </>
          )}
          {tab === "shopping" && <ShoppingList connected={Boolean(whatsappLink)} onConnect={() => profileComplete ? setConnectingWhatsApp(true) : setCompletingProfile(true)} />}
          {tab === "profile" &&
            (profileComplete ? (
              <ProfilePanel
                session={session}
                onSaved={refreshSession}
                onExit={onExit}
                onPlans={onPlans}
              />
            ) : (
              <CompleteProfileCard
                locked
                onComplete={() => setCompletingProfile(true)}
              />
            ))}
        </div>
      </section>
      {editing !== undefined && (
        <TransactionModal
          transaction={editing}
          onClose={() => setEditing(undefined)}
          onSaved={() => loadTransactions()}
        />
      )}
      {completingProfile && (
        <div className="modal-backdrop profile-modal-backdrop">
          <div
            className="modal profile-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Completar cadastro"
          >
            <button
              type="button"
              className="modal-close"
              onClick={() => setCompletingProfile(false)}
            >
              ×
            </button>
            <ProfileForm
              session={session}
              completion
              onSaved={async () => {
                const next = await refreshSession();
                if (next.profile?.profileCompleted) {
                  setCompletingProfile(false);
                  window.history.replaceState({}, "", window.location.pathname);
                }
                return next;
              }}
            />
          </div>
        </div>
      )}
      {connectingWhatsApp && (
        <WhatsAppConnectModal
          configured={Boolean(session.integrations?.evolution)}
          initialConnection={whatsappConnection}
          initialLink={whatsappLink}
          onClose={() => setConnectingWhatsApp(false)}
          onChanged={handleWhatsAppChanged}
        />
      )}
    </main>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("landing");
  const [authMode, setAuthMode] = useState<"register" | "login">("login");
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("trial");
  const [session, setSession] = useState<Session | null>(null);
  const [promptProfileCompletion, setPromptProfileCompletion] = useState(false);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [paymentCancelled, setPaymentCancelled] = useState(false);
  const refreshSession = useCallback(async () => {
    try {
      const next = await api<Session>("/api/me");
      setSession(next);
      return next;
    } catch {
      const next = { authenticated: false } as Session;
      setSession(next);
      return next;
    }
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    void refreshSession().then((next) => {
      if (next.authenticated && (params.get("continue_checkout") === "1" || params.get("view") === "plans")) {
        if (isPaidPlan(params.get("plan"))) setSelectedPlan(params.get("plan") as PlanId);
        setPaymentCancelled(params.get("checkout") === "cancelled");
        setView("plans");
        return;
      }
      if (
        next.authenticated &&
        (params.get("checkout") === "success" ||
          params.get("view") === "dashboard" ||
          params.get("google") === "success")
      ) {
        setPromptProfileCompletion(params.get("complete_profile") === "1");
        if (params.get("checkout") === "success") setCheckoutSessionId(params.get("session_id"));
        if (params.get("billing") === "refresh") void api("/api/billing/status?refresh=1").then(() => refreshSession()).catch(() => undefined);
        setView("dashboard");
      } else if (params.get("google") === "account_missing") setView("plans");
      else if (["failed", "not_configured"].includes(params.get("google") || "")) {
        setAuthMode("login");
        setView("auth");
      }
    });
  }, [refreshSession]);
  useEffect(() => {
    if (session && !session.authenticated && view === "dashboard")
      setView("landing");
  }, [session, view]);
  async function logout() {
    if (session?.appAuth || session?.localAuth)
      await api("/api/auth/logout", { method: "POST", body: "{}" }).catch(
        () => null,
      );
    await refreshSession();
    setView("landing");
  }
  if (view === "auth")
    return (
      <Auth
        mode={authMode}
        selectedPlan={selectedPlan}
        refresh={refreshSession}
        onDone={() => setView(authMode === "register" && isPaidPlan(selectedPlan) ? "plans" : "dashboard")}
        onBack={() => setView(authMode === "register" ? "plans" : "landing")}
        onChoosePlan={() => setView("plans")}
      />
    );
  if (view === "plans")
    return (
      <Plans
        session={session}
        selected={selectedPlan}
        setSelected={setSelectedPlan}
        onBack={() => setView("landing")}
        onNeedAccount={() => {
          setAuthMode("register");
          setView("auth");
        }}
        onDashboard={() => setView("dashboard")}
        paymentCancelled={paymentCancelled}
      />
    );
  if (view === "dashboard" && session?.authenticated)
    return (
      <Dashboard
        session={session}
        refreshSession={refreshSession}
        onExit={logout}
        startProfileCompletion={promptProfileCompletion}
        onPlans={() => { setPaymentCancelled(false); setView("plans"); }}
        checkoutSessionId={checkoutSessionId}
        onCheckoutClose={() => {
          setCheckoutSessionId(null);
          const url = new URL(window.location.href);
          url.searchParams.delete("checkout"); url.searchParams.delete("session_id");
          window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        }}
      />
    );
  return (
    <Landing
      onLogin={() => {
        if (session?.authenticated) setView("dashboard");
        else {
          setAuthMode("login");
          setView("auth");
        }
      }}
      onPlans={() => setView("plans")}
    />
  );
}
