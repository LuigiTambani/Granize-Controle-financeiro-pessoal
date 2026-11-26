import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function compile(file, imports) {
  let output = ts.transpileModule(await readFile(new URL(file, root), "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  for (const [from, to] of Object.entries(imports)) output = output.replaceAll(JSON.stringify(from), JSON.stringify(to));
  return dataUrl(output);
}

test("fluxo Stripe: autenticação real, confirmação, idempotência, inadimplência e isolamento", async (t) => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const query = (sql, params = []) => ({
    bind(...values) { return query(sql, values); },
    async first() { return sqlite.prepare(sql).get(...params) || null; },
    async all() { return { results: sqlite.prepare(sql).all(...params) }; },
    async run() { const result = sqlite.prepare(sql).run(...params); return { meta: { changes: Number(result.changes) } }; },
    runSync() { return sqlite.prepare(sql).run(...params); },
  });
  const db = { prepare: query, async batch(statements) {
    sqlite.exec("BEGIN");
    try { const result = statements.map((statement) => statement.runSync()); sqlite.exec("COMMIT"); return result; }
    catch (error) { sqlite.exec("ROLLBACK"); throw error; }
  } };
  const env = { DB: db, STRIPE_MODE: "test", STRIPE_SECRET_KEY: "sk_test_fixture", STRIPE_WEBHOOK_SECRET: "whsec_fixture", APP_URL: "http://localhost:3000" };
  globalThis.__billingEnv = env;
  const serverUrl = await compile("app/api/_lib/server.ts", {
    "./environment": dataUrl("export const env = globalThis.__billingEnv;"),
    "./database": dataUrl("export const postgresDatabase = () => { throw new Error('Banco real fora do simulador'); };"),
    "./storage": dataUrl("export const profileStorage = () => { throw new Error('Storage real fora do simulador'); };"),
  });
  const server = await import(serverUrl);
  await server.ensureSchema();
  const lib = new URL("app/lib/billing.ts", root).href;
  const stripeUrl = await compile("app/api/_lib/stripe.ts", { "./server": serverUrl, "../../lib/billing": lib });
  const stripe = await import(stripeUrl);
  const checkout = await import(await compile("app/api/checkout/route.ts", { "../_lib/server": serverUrl, "../_lib/stripe": stripeUrl, "../../lib/billing": lib }));
  const signatureUrl = await compile("app/api/_lib/stripe-signature.ts", {});
  const stripeSignature = await import(signatureUrl);
  const webhook = await import(await compile("app/api/stripe/webhook/route.ts", { "../../_lib/server": serverUrl, "../../_lib/stripe": stripeUrl, "../../_lib/stripe-signature": signatureUrl }));
  const status = await import(await compile("app/api/billing/status/route.ts", { "../../_lib/server": serverUrl, "../../_lib/stripe": stripeUrl }));
  const portal = await import(await compile("app/api/stripe/portal/route.ts", { "../../_lib/server": serverUrl, "../../_lib/stripe": stripeUrl }));
  for (const id of ["first", "second"]) {
    sqlite.prepare("INSERT INTO users (id, email, full_name) VALUES (?, ?, ?)").run(id, `${id}@example.test`, id);
    sqlite.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(createHash("sha256").update(`token-${id}`).digest("hex"), id, "2099-01-01");
    sqlite.prepare("INSERT INTO subscriptions (user_id, provider, plan, status) VALUES (?, 'local', 'trial', 'active')").run(id);
  }
  sqlite.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, 'first', ?)").run(createHash("sha256").update("expired").digest("hex"), new Date(Date.now() - 3600000).toISOString());
  const requests = [], sessions = new Map(), subscriptions = new Map(), keys = new Map();
  let throwOnCreate = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.stripe.com", "nenhuma chamada externa deve escapar do simulador");
    assert.equal(init.headers["Stripe-Version"], "2025-06-30.basil");
    const method = init.method || "GET", body = new URLSearchParams(init.body);
    requests.push({ path: url.pathname, method, body, headers: init.headers });
    if (url.pathname === "/v1/checkout/sessions" && method === "POST") {
      const key = init.headers["Idempotency-Key"];
      assert.ok(key);
      if (keys.has(key)) return Response.json(keys.get(key));
      const id = `cs_test_session${sessions.size + 1}`;
      const session = { id, mode: "subscription", status: "open", payment_status: "unpaid", url: `https://checkout.stripe.com/c/pay/${id}`, client_reference_id: body.get("client_reference_id"), metadata: { user_id: body.get("metadata[user_id]"), plan: body.get("metadata[plan]"), checkout_attempt_id: body.get("metadata[checkout_attempt_id]") }, subscription: null, expires_at: Math.floor(Date.now() / 1000) + 86400 };
      sessions.set(id, session); keys.set(key, session);
      if (throwOnCreate) { throwOnCreate = false; throw new Error("resposta de rede perdida depois de criar sessão"); }
      return Response.json(session);
    }
    if (url.pathname.startsWith("/v1/checkout/sessions/")) {
      const id = url.pathname.split("/")[4], session = sessions.get(id);
      if (url.pathname.endsWith("/expire")) session.status = "expired";
      assert.ok(session, url.pathname); return Response.json(session);
    }
    if (url.pathname.startsWith("/v1/subscriptions/")) {
      const subscription = subscriptions.get(url.pathname.split("/")[3]);
      assert.ok(subscription, url.pathname); return Response.json(subscription);
    }
    if (url.pathname === "/v1/billing_portal/sessions") return Response.json({ url: `https://billing.stripe.com/p/session/${body.get("customer")}` });
    throw new Error(`Chamada Stripe não prevista: ${method} ${url.pathname}`);
  };
  const request = (path, method = "GET", body, user = "first", headers = {}) => new Request(`http://localhost:3000${path}`, { method, headers: { ...(user ? { cookie: `granize_session=token-${user}` } : {}), "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  let eventCounter = 0;
  const eventRequest = (type, object, options = {}) => {
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
    const event = { id: options.id || `evt_fixture${++eventCounter}`, type, created: options.created ?? timestamp, livemode: options.live ?? false, data: { object } };
    const raw = JSON.stringify(event), signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest("hex");
    return new Request("http://localhost:3000/api/stripe/webhook", { method: "POST", headers: { "stripe-signature": `t=${timestamp},v1=${signature}` }, body: raw });
  };
  function attachSubscription(session, id = "sub_fixture1", state = "active") {
    const plan = session.metadata.plan;
    const terms = { basic: [1290, "month", 1], pro: [5990, "month", 6], annual: [9990, "year", 1] }[plan];
    const remote = { id, customer: `cus_${session.client_reference_id}`, status: state, metadata: { ...session.metadata }, cancel_at_period_end: false,
      latest_invoice: { id: "in_fixture", status: "paid" }, items: { data: [{ quantity: 1, current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30, price: { unit_amount: terms[0], currency: "brl", recurring: { interval: terms[1], interval_count: terms[2] } } }] } };
    subscriptions.set(id, remote); session.subscription = id; session.status = "complete"; session.payment_status = "paid";
    return remote;
  }
  try {
    await t.test("exige sessão verificada e rejeita origem externa e plano adulterado", async () => {
      const forged = request("/api/checkout", "POST", { plan: "basic" }, "", { "oai-authenticated-user-id": "first", "oai-authenticated-user-email": "first@example.test" });
      assert.equal((await checkout.POST(forged)).status, 401);
      assert.equal((await checkout.POST(request("/api/checkout", "POST", { plan: "basic" }, "", { cookie: "granize_session=expired" }))).status, 401);
      assert.equal((await checkout.POST(request("/api/checkout", "POST", { plan: "basic" }, "first", { origin: "https://evil.test" }))).status, 403);
      for (const plan of ["trial", "constructor", "__proto__", "unknown", undefined]) assert.equal((await checkout.POST(request("/api/checkout", "POST", { plan }))).status, 400);
      assert.equal(requests.length, 0);
    });
    await t.test("checkout não altera Grátis e cliques repetidos reutilizam a mesma sessão", async () => {
      const response = await checkout.POST(request("/api/checkout", "POST", { plan: "basic", amount: 1, userId: "second" }, "first", { "x-forwarded-host": "evil.test", "x-forwarded-proto": "http" }));
      assert.equal(response.status, 200);
      const created = requests.find((entry) => entry.path === "/v1/checkout/sessions");
      assert.equal(created.body.get("line_items[0][price_data][unit_amount]"), "1290");
      assert.equal(created.body.get("client_reference_id"), "first");
      assert.match(created.body.get("success_url"), /^http:\/\/localhost:3000\//);
      assert.equal((await stripe.subscriptionRow("first")).plan, "trial");
      const firstUrl = (await response.json()).checkoutUrl;
      assert.equal((await (await checkout.POST(request("/api/checkout", "POST", { plan: "basic" }))).json()).checkoutUrl, firstUrl);
      assert.equal(sessions.size, 1);
      const privateSession = await status.GET(request("/api/billing/status?session_id=cs_test_session1", "GET", undefined, "second"));
      assert.equal(privateSession.status, 404);
    });
    await t.test("trocar plano expira checkout aberto e cria cobrança com prazo correto", async () => {
      assert.equal((await checkout.POST(request("/api/checkout", "POST", { plan: "pro" }))).status, 200);
      assert.equal(sessions.get("cs_test_session1").status, "expired");
      assert.equal(sessions.size, 2);
      const created = requests.filter((entry) => entry.path === "/v1/checkout/sessions").at(-1);
      assert.equal(created.body.get("line_items[0][price_data][unit_amount]"), "5990");
      assert.equal(created.body.get("line_items[0][price_data][recurring][interval_count]"), "6");
    });
    await t.test("retorno sem pagamento não ativa plano; confirmação consulta a Stripe", async () => {
      let result = await status.GET(request("/api/billing/status?session_id=cs_test_session2"));
      assert.equal((await result.json()).paymentStatus, "pending");
      const session = sessions.get("cs_test_session2");
      attachSubscription(session);
      result = await status.GET(request("/api/billing/status?session_id=cs_test_session2"));
      const data = await result.json();
      assert.equal(data.paymentStatus, "confirmed");
      assert.equal(data.subscription.plan, "pro");
      assert.equal(data.paidActive, true);
      assert.equal((await checkout.POST(request("/api/checkout", "POST", { plan: "annual" }))).status, 409);
    });
    await t.test("webhook assinado é idempotente e entende a estrutura atual de faturas", async () => {
      const invoice = { id: "in_fixture", parent: { subscription_details: { subscription: "sub_fixture1" } } };
      assert.equal((await webhook.POST(eventRequest("invoice.paid", invoice, { id: "evt_repeated" }))).status, 200);
      const count = requests.length;
      const duplicate = await webhook.POST(eventRequest("invoice.paid", invoice, { id: "evt_repeated" }));
      assert.equal((await duplicate.json()).duplicate, true);
      assert.equal(requests.length, count);
      assert.equal(sqlite.prepare("SELECT count(*) AS total FROM webhook_events WHERE id = 'evt_repeated'").get().total, 1);
    });
    await t.test("gerenciamento usa apenas o cliente da conta autenticada", async () => {
      const result = await portal.POST(request("/api/stripe/portal", "POST", { customer: "cus_second" }));
      assert.equal(result.status, 200);
      assert.match((await result.json()).url, /cus_first/);
      assert.equal((await portal.POST(request("/api/stripe/portal", "POST", {}, "second"))).status, 404);
    });
    await t.test("cancelamento agendado mantém acesso e falha/encerramento preservam Grátis", async () => {
      const remote = subscriptions.get("sub_fixture1");
      remote.cancel_at_period_end = true;
      await webhook.POST(eventRequest("customer.subscription.updated", { id: remote.id }));
      let data = await (await status.GET(request("/api/billing/status"))).json();
      assert.equal(data.cancelAtPeriodEnd, true); assert.equal(data.subscription.plan, "pro");
      remote.status = "past_due"; remote.latest_invoice.status = "open";
      await webhook.POST(eventRequest("invoice.payment_failed", { subscription: remote.id }));
      data = await (await status.GET(request("/api/billing/status"))).json();
      assert.equal(data.subscription.plan, "trial"); assert.equal(data.subscription.currentPeriodEnd, null);
      remote.status = "canceled";
      await webhook.POST(eventRequest("customer.subscription.deleted", { id: remote.id }));
      await webhook.POST(eventRequest("invoice.paid", { subscription: remote.id }, { created: Math.floor(Date.now() / 1000) - 100 }));
      assert.equal((await stripe.subscriptionRow("first")).status, "canceled");
      assert.equal((await (await status.GET(request("/api/billing/status"))).json()).subscription.plan, "trial");
    });
    await t.test("checkout expirado não gera assinatura nem remove o acesso gratuito", async () => {
      await checkout.POST(request("/api/checkout", "POST", { plan: "basic" }, "second"));
      const session = Array.from(sessions.values()).find((value) => value.client_reference_id === "second");
      session.status = "expired";
      await webhook.POST(eventRequest("checkout.session.expired", { id: session.id }));
      assert.equal((await stripe.subscriptionRow("second")).plan, "trial");
      assert.equal(sqlite.prepare("SELECT status FROM billing_checkouts WHERE session_id = ?").get(session.id).status, "expired");
    });
    await t.test("pagamento pendente não ativa benefícios até uma fatura confirmada", async () => {
      await checkout.POST(request("/api/checkout", "POST", { plan: "basic" }, "second"));
      const session = Array.from(sessions.values()).filter((value) => value.client_reference_id === "second").at(-1);
      const remote = attachSubscription(session, "sub_fixture2");
      session.payment_status = "unpaid"; remote.latest_invoice.status = "open";
      await webhook.POST(eventRequest("checkout.session.completed", { id: session.id }));
      assert.equal((await (await status.GET(request("/api/billing/status", "GET", undefined, "second"))).json()).subscription.plan, "trial");
      session.payment_status = "paid"; remote.latest_invoice.status = "paid";
      await webhook.POST(eventRequest("invoice.paid", { parent: { subscription_details: { subscription: remote.id } } }));
      assert.equal((await (await status.GET(request(`/api/billing/status?session_id=${session.id}`, "GET", undefined, "second"))).json()).paymentStatus, "confirmed");
    });
    await t.test("assinaturas inválidas, ambiente errado e mensagens expiradas são rejeitados", async () => {
      assert.equal((await webhook.POST(new Request("http://localhost/api/stripe/webhook", { method: "POST", body: "{}" }))).status, 400);
      assert.equal((await webhook.POST(eventRequest("invoice.paid", {}, { timestamp: Math.floor(Date.now() / 1000) - 1000 }))).status, 400);
      assert.equal((await webhook.POST(eventRequest("invoice.paid", {}, { live: true }))).status, 400);
      const raw = "{}", stamp = "NaN", signature = createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${stamp}.${raw}`).digest("hex");
      assert.equal(await stripeSignature.verifyStripeSignature(raw, `t=${stamp},v1=${signature}`, env.STRIPE_WEBHOOK_SECRET), false);
      env.STRIPE_SECRET_KEY = "sk_live_fixture";
      assert.equal(stripe.stripeConfigured(), false);
      env.STRIPE_MODE = "live";
      assert.throws(() => stripe.billingOrigin(request("/")), /HTTPS/);
      env.STRIPE_MODE = "test"; env.STRIPE_SECRET_KEY = "sk_test_fixture";
    });
    await t.test("resposta perdida do checkout é recuperada sem criar outra cobrança", async () => {
      throwOnCreate = true;
      const failed = await checkout.POST(request("/api/checkout", "POST", { plan: "annual" }));
      assert.equal(failed.status, 502);
      const count = sessions.size;
      sqlite.prepare("UPDATE billing_checkouts SET created_at = datetime('now', '-1 minute') WHERE user_id = 'first' AND status = 'creating'").run();
      assert.equal((await checkout.POST(request("/api/checkout", "POST", { plan: "annual" }))).status, 200);
      assert.equal(sessions.size, count);
      const calls = requests.filter((entry) => entry.path === "/v1/checkout/sessions" && entry.body.get("metadata[plan]") === "annual");
      assert.equal(calls.at(-1).headers["Idempotency-Key"], calls.at(-2).headers["Idempotency-Key"]);
    });
    await t.test("evento de assinatura antiga não substitui uma nova assinatura ativa", async () => {
      const session = Array.from(sessions.values()).filter((value) => value.client_reference_id === "first").at(-1);
      attachSubscription(session, "sub_newAnnual");
      assert.equal((await webhook.POST(eventRequest("checkout.session.completed", { id: session.id }))).status, 200);
      assert.equal((await stripe.subscriptionRow("first")).subscriptionId, "sub_newAnnual");
      await webhook.POST(eventRequest("customer.subscription.deleted", { id: "sub_fixture1" }));
      assert.equal((await stripe.subscriptionRow("first")).subscriptionId, "sub_newAnnual");
      assert.equal((await stripe.subscriptionRow("first")).status, "active");
    });
    await t.test("sem credenciais não tenta cobrar e o plano gratuito permanece disponível", async () => {
      const prior = env.STRIPE_SECRET_KEY, count = requests.length;
      env.STRIPE_SECRET_KEY = "";
      assert.equal((await checkout.POST(request("/api/checkout", "POST", { plan: "basic" }))).status, 503);
      assert.equal(requests.length, count);
      env.STRIPE_SECRET_KEY = prior;
    });
  } finally { globalThis.fetch = originalFetch; delete globalThis.__billingEnv; sqlite.close(); }
});
