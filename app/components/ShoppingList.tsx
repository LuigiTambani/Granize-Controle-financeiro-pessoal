"use client";
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { ShoppingItem } from "../lib/shopping";

async function requestList(init?: RequestInit) {
  const response = await fetch("/api/shopping-list", { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json() as { items: ShoppingItem[]; error?: string };
  if (!response.ok) throw new Error(data.error || "Não foi possível atualizar sua lista.");
  return data.items;
}

export default function ShoppingList({ connected, onConnect }: { connected: boolean; onConnect: () => void }) {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [name, setName] = useState("");
  const [filter, setFilter] = useState<"pending" | "completed">("pending");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [removed, setRemoved] = useState<ShoppingItem | null>(null);
  const sequence = useRef(0), mutating = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const load = useCallback(async (signal?: AbortSignal) => {
    if (mutating.current) return;
    const id = ++sequence.current;
    try {
      const data = await requestList({ signal });
      if (id === sequence.current) { setItems(data); setError(""); }
    } catch (reason) {
      if (!signal?.aborted && id === sequence.current) setError(reason instanceof Error ? reason.message : "Não foi possível carregar sua lista.");
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController(), requests = sequence;
    // This starts an asynchronous fetch; state changes only after its response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    const refresh = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { requests.current++; controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, [load]);

  async function mutate(method: "POST" | "PATCH" | "DELETE", payload: object, message: string) {
    if (mutating.current) return false;
    mutating.current = true;
    const id = ++sequence.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await requestList({ method, body: JSON.stringify(payload) });
      if (id === sequence.current) { setItems(data); setNotice(message); }
      return true;
    } catch (reason) {
      if (id === sequence.current) setError(reason instanceof Error ? reason.message : "Não foi possível atualizar sua lista.");
      return false;
    } finally { mutating.current = false; if (id === sequence.current) setBusy(false); }
  }
  async function add(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) { inputRef.current?.focus(); return; }
    if (await mutate("POST", { name }, "Produto adicionado à sua lista.")) { setName(""); setFilter("pending"); setRemoved(null); }
  }
  const pending = items?.filter((item) => !item.completedAt) || [];
  const completed = items?.filter((item) => item.completedAt) || [];
  const visible = filter === "pending" ? pending : completed;
  return <div className="shopping-page">
    <section className="shopping-intro"><div className="shopping-symbol" aria-hidden="true"><CartIcon /></div><div><h2>Compre o que precisa. Sem esquecer nada.</h2><p>Adicione os produtos que faltam e marque o que já comprou.</p></div><span>{pending.length} {pending.length === 1 ? "item pendente" : "itens pendentes"}</span></section>
    <section className="shopping-card" aria-label="Seus produtos">
      <form className="shopping-add-form" onSubmit={(event) => void add(event)}>
        <label htmlFor="shopping-product">O que está faltando?</label>
        <div><input ref={inputRef} id="shopping-product" value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: pasta de dente, leite, arroz" maxLength={1000} disabled={busy} required autoComplete="off" /><button className="button primary" disabled={busy || !name.trim()} type="submit">{busy ? "Aguarde…" : "Adicionar"}<span aria-hidden="true">+</span></button></div>
        <small>Separe por vírgulas para adicionar mais de um produto.</small>
      </form>
      {error && <div className="form-error" role="alert">{error}<button className="finance-text-button" disabled={busy} onClick={() => void load()}>Tentar novamente</button></div>}
      <div className="shopping-notice" role="status" aria-live="polite">{notice}{removed && <button disabled={busy} onClick={async () => {
        if (await mutate("POST", { name: removed.name }, `${removed.name} voltou à lista de pendentes.`)) { setRemoved(null); setFilter("pending"); }
      }}>Desfazer remoção</button>}</div>
      <div className="shopping-filters" role="group" aria-label="Mostrar produtos"><button aria-pressed={filter === "pending"} onClick={() => setFilter("pending")}>Pendentes <span>{pending.length}</span></button><button aria-pressed={filter === "completed"} onClick={() => setFilter("completed")}>Comprados <span>{completed.length}</span></button></div>
      {items === null ? <div className="shopping-empty" role="status"><CartIcon /><p>{error ? "Sua lista não pôde ser carregada." : "Carregando sua lista…"}</p></div> : !visible.length ? <div className="shopping-empty"><CartIcon /><h3>{filter === "pending" ? (completed.length ? "Tudo comprado por aqui!" : "Sua lista começa aqui") : "Ainda não há produtos comprados"}</h3><p>{filter === "pending" ? "Adicione um produto acima ou envie pelo WhatsApp o que acabou em casa." : "Marque os produtos da lista à medida que fizer suas compras."}</p></div> : <ul className="shopping-items">{visible.map((item) => <li key={item.id} className={item.completedAt ? "completed" : ""}>
        <label><input type="checkbox" checked={Boolean(item.completedAt)} disabled={busy} aria-label={`${item.completedAt ? "Voltar para pendentes" : "Marcar como comprado"}: ${item.name}`} onChange={(event) => { void mutate("PATCH", { id: item.id, completed: event.target.checked }, event.target.checked ? `${item.name} marcado como comprado.` : `${item.name} voltou aos pendentes.`); setRemoved(null); }} /><span><b>{item.name}</b><small>{item.source === "whatsapp" ? "Adicionado pelo WhatsApp" : "Adicionado pelo site"}</small></span></label>
        <button className="shopping-remove" aria-label={`Remover ${item.name}`} title="Remover produto" disabled={busy} onClick={async () => { if (await mutate("DELETE", { id: item.id }, `${item.name} removido da lista.`)) setRemoved(item); }}><svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.7" fill="none" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg></button>
      </li>)}</ul>}
      <p className="shopping-finance-note">Marcar um produto como comprado não cria uma despesa. Registre o gasto em Lançamentos ou informe o valor pelo WhatsApp.</p>
    </section>
    <section className="shopping-whatsapp"><span className="whatsapp-logo"><img src="/whatsapp-logo.svg" alt="WhatsApp" /></span><div><h2>Sua lista também está no WhatsApp</h2><p>Diga <b>“Granize, acabou a pasta de dente”</b> para adicionar. No mercado, envie <b>“lista de compras”</b> para consultar.</p><small>{connected ? "Conectado à sua conta. A lista é atualizada automaticamente no site." : "Conecte seu número para usar a mesma lista pelo WhatsApp."}</small></div>{!connected && <button className="button soft" onClick={onConnect}>Conectar WhatsApp →</button>}</section>
  </div>;
}

function CartIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 3h2l2.5 12H19l2-8H6M8 19h.01M18 19h.01" /><circle cx="8" cy="19" r="1" /><circle cx="18" cy="19" r="1" /></svg>;
}
