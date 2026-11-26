"use client";
import { useCallback, useEffect, useState } from "react";
import { isPaidPlan, paidPlans, type BillingStatus } from "../lib/billing";

async function billingRequest(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível consultar seu pagamento.");
  return data;
}

export default function BillingPanel({ initial, onRefresh, onPlans }: { initial?: BillingStatus; onRefresh: () => Promise<unknown>; onPlans: () => void }) {
  const [billing, setBilling] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const reload = useCallback(async (signal: AbortSignal) => {
    try {
      const data = await billingRequest("/api/billing/status?refresh=1", { signal }) as BillingStatus;
      if (!signal.aborted) { setBilling(data); await onRefresh(); }
    } catch (reason) { if (!signal.aborted) setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a assinatura."); }
  }, [onRefresh]);
  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Starts an asynchronous billing refresh.
    void reload(controller.signal);
    return () => controller.abort();
  }, [reload]);
  async function manage() {
    setBusy(true); setError("");
    try { const data = await billingRequest("/api/stripe/portal", { method: "POST" }); window.location.assign(data.url); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível abrir o gerenciamento."); setBusy(false); }
  }
  const paid = Boolean(billing?.paidActive);
  const end = billing?.currentPeriodEnd ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(new Date(billing.currentPeriodEnd)) : "";
  const statusLabels: Record<string, string> = { past_due: "Pagamento pendente", unpaid: "Pagamento pendente", payment_pending: "Pagamento em confirmação", incomplete: "Pagamento incompleto", canceled: "Assinatura encerrada", cancelled: "Assinatura encerrada", paused: "Assinatura pausada" };
  return <section className="billing-panel" aria-labelledby="billing-panel-title"><header><div><span>SEU PLANO</span><h2 id="billing-panel-title">{paid && billing && isPaidPlan(billing.plan) ? `Granize ${paidPlans[billing.plan].name}` : "Grátis, para sempre"}</h2></div><span className="billing-status">{billing?.status && statusLabels[billing.status] || (paid ? "Assinatura ativa" : "Sem cobrança")}</span></header>
    <p>{paid ? billing?.cancelAtPeriodEnd ? `Cancelamento agendado. Seu plano pago continua disponível até ${end}. Depois, você volta ao Grátis.` : `Sua próxima renovação está prevista para ${end}.` : "Seu acesso Grátis não vence e não precisa de cartão. Assinar um plano pago é opcional."}</p>
    {billing?.configured && billing.mode === "test" && <small className="billing-test-mode">Ambiente de teste: nenhum pagamento real é realizado.</small>}
    {error && <div className="form-error" role="alert">{error}</div>}
    <div className="billing-actions"><button className="button primary" onClick={onPlans}>Ver planos</button>{billing?.canManage && <button className="button soft" onClick={() => void manage()} disabled={busy || !billing.configured}>{busy ? "Abrindo…" : "Gerenciar pagamentos"}</button>}</div>
    {billing?.canManage && <small>Consulte suas faturas, atualize o cartão ou cancele a assinatura na página segura de pagamento.</small>}
  </section>;
}

export function CheckoutConfirmation({ sessionId, onRefresh, onClose }: { sessionId: string; onRefresh: () => Promise<unknown>; onClose: () => void }) {
  const [state, setState] = useState<"pending" | "confirmed" | "error">("pending");
  const [message, setMessage] = useState("Estamos confirmando o pagamento. Seu plano atual continua disponível.");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function verify(attempt = 0) {
      try {
        const result = await billingRequest(`/api/billing/status?session_id=${encodeURIComponent(sessionId)}`, { signal: controller.signal }) as BillingStatus;
        if (controller.signal.aborted) return;
        if (result.paymentStatus === "confirmed") { setState("confirmed"); setMessage("Pagamento confirmado! Seu plano foi atualizado."); await onRefresh(); return; }
        if (result.paymentStatus === "expired" || result.paymentStatus === "failed") throw new Error("Este pagamento não foi concluído. Seu plano atual foi mantido.");
        if (attempt < 7) { timer = setTimeout(() => void verify(attempt + 1), 2000); return; }
        setState("error"); setMessage("O pagamento ainda está em confirmação. Você pode continuar usando a Granize e verificar novamente depois.");
      } catch (reason) { if (!controller.signal.aborted) { setState("error"); setMessage(reason instanceof Error ? reason.message : "Não foi possível confirmar o pagamento agora."); } }
    }
    void verify();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [sessionId, onRefresh, retry]);
  return <section className={`checkout-feedback ${state}`} role="status" aria-live="polite"><div><h2>{state === "confirmed" ? "Tudo certo com seu pagamento" : state === "pending" ? "Confirmando seu pagamento" : "Confira seu pagamento"}</h2><p>{message}</p></div><div>{state === "error" && <button className="button soft" onClick={() => { setState("pending"); setRetry(retry + 1); }}>Verificar novamente</button>}<button className="checkout-feedback-close" aria-label="Fechar aviso de pagamento" onClick={onClose}>×</button></div></section>;
}
