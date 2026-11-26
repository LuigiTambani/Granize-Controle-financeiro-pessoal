import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const source = await readFile(new URL("app/components/BillingPanel.tsx", root), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replaceAll('"react"', JSON.stringify(import.meta.resolve("react")))
  .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")))
  .replaceAll('"../lib/billing"', JSON.stringify(new URL("app/lib/billing.ts", root).href));
const { default: BillingPanel, CheckoutConfirmation } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const base = { mode: "test", configured: false, paidActive: false, plan: "trial", status: "active", currentPeriodEnd: null, canManage: false, cancelAtPeriodEnd: false };

test("perfil mostra Grátis permanente, renovação ou cancelamento sem expor dados de cartão", () => {
  const props = { onRefresh: async () => {}, onPlans() {} };
  const free = renderToStaticMarkup(createElement(BillingPanel, { ...props, initial: base }));
  assert.match(free, /Grátis, para sempre/);
  assert.doesNotMatch(free, /Gerenciar pagamentos|type="password"|name="card/);
  const active = renderToStaticMarkup(createElement(BillingPanel, { ...props, initial: { ...base, plan: "pro", paidActive: true, configured: true, canManage: true, currentPeriodEnd: "2030-12-25T12:00:00Z" } }));
  assert.match(active, /Granize Pro/);
  assert.match(active, /renovação/);
  assert.match(active, /Gerenciar pagamentos/);
  assert.match(active, /nenhum pagamento real/);
  const cancellation = renderToStaticMarkup(createElement(BillingPanel, { ...props, initial: { ...base, plan: "basic", paidActive: true, cancelAtPeriodEnd: true, currentPeriodEnd: "2030-12-25T12:00:00Z" } }));
  assert.match(cancellation, /Cancelamento agendado/);
  assert.match(cancellation, /volta ao Grátis/);
});

test("página de retorno não confirma pagamento antes da resposta protegida do servidor", async () => {
  const html = renderToStaticMarkup(createElement(CheckoutConfirmation, { sessionId: "cs_test_example", onRefresh: async () => {}, onClose() {} }));
  assert.match(html, /Confirmando seu pagamento/);
  assert.doesNotMatch(html, /Pagamento confirmado!/);
  assert.match(source, /result\.paymentStatus === "confirmed"/);
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  assert.match(page, /authMode === "register" && isPaidPlan\(selectedPlan\) \? "plans" : "dashboard"/);
  assert.match(page, /accountReady = Boolean\(session\?\.authenticated && session\.profile\)/);
  assert.match(page, /CheckoutConfirmation sessionId=\{checkoutSessionId\}/);
});
