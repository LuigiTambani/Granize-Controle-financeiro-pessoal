import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
async function compile(file, imports) {
  const source = await readFile(new URL(file, root), "utf8");
  let output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  for (const [from, to] of Object.entries(imports)) output = output.replaceAll(JSON.stringify(from), JSON.stringify(to));
  return dataUrl(output);
}

test("lista persistente isolada por conta, integração autorizada e reentregas idempotentes", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON; CREATE TABLE users (id TEXT PRIMARY KEY); INSERT INTO users VALUES ('first'), ('second');");
  sqlite.exec(await readFile(new URL("drizzle/0005_shopping_list.sql", root), "utf8"));
  const statement = (sql, params = []) => ({
    bind(...values) { return statement(sql, values); },
    async all() { return { results: sqlite.prepare(sql).all(...params) }; },
    async first() { return sqlite.prepare(sql).get(...params) || null; },
    async run() { return sqlite.prepare(sql).run(...params); },
  });
  globalThis.__shoppingDb = {
    prepare: statement,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = []; for (const query of statements) results.push(await query.run()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  const server = dataUrl(`
    export class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
    export function getD1() { return globalThis.__shoppingDb; }
    export async function ensureSchema() {}
    export function runtimeString() { return 'test-secret'; }
    export async function requireApiUser(request) { const id = request.headers.get('x-test-user'); if (!id) throw new ApiError(401, 'Entre para continuar.'); return {id}; }
    export function errorResponse(error) { return Response.json({error:error.message}, {status:error.status || 500}); }
  `);
  const access = dataUrl(`export async function requireActiveWhatsAppAccess(phone) {
    if (phone === 'unlinked') return {allowed:false,reason:'not_linked',access:null};
    if (phone === 'inactive') return {allowed:false,reason:'subscription_inactive',access:null};
    return {allowed:true,access:{userId:phone === 'second-phone' ? 'second' : 'first'}};
  }`);
  const lib = new URL("app/lib/shopping.ts", root).href;
  const service = await compile("app/api/_lib/shopping.ts", { "./server": server, "../../lib/shopping": lib });
  const web = await import(await compile("app/api/shopping-list/route.ts", { "../_lib/server": server, "../_lib/shopping": service, "../../lib/shopping": lib }));
  const bot = await import(await compile("app/api/integrations/shopping-list/route.ts", { "../../_lib/server": server, "../../_lib/shopping": service, "../_lib/whatsapp-access": access, "../../../lib/shopping": lib }));
  const webRequest = (method = "GET", payload, user = "first") => new Request("http://localhost/api/shopping-list", { method, headers: user ? { "x-test-user": user, "Content-Type": "application/json" } : {}, body: payload ? JSON.stringify(payload) : undefined });
  const botRequest = (text, externalId = crypto.randomUUID(), phone = "first-phone", secret = "test-secret", inputType = "text") => new Request("http://localhost/api/integrations/shopping-list", { method: "POST", headers: { "x-granize-secret": secret, "Content-Type": "application/json" }, body: JSON.stringify({ text, externalId, phone, inputType }) });
  try {
    assert.equal((await web.GET(webRequest("GET", null, ""))).status, 401);
    let response = await bot.POST(botRequest("Granize, acabou a pasta de dente", "event-1"));
    assert.equal(response.status, 200);
    assert.match((await response.json()).responseText, /Adicionado/);
    await bot.POST(botRequest("Granize, acabou a pasta de dente", "event-1"));
    let list = (await (await web.GET(webRequest())).json()).items;
    assert.equal(list.length, 1);
    assert.equal(list[0].name, "pasta de dente");
    const itemId = list[0].id;
    assert.deepEqual((await (await web.GET(webRequest("GET", null, "second"))).json()).items, []);
    assert.equal((await web.PATCH(webRequest("PATCH", { id: itemId, completed: true }, "second"))).status, 404);
    assert.equal((await web.DELETE(webRequest("DELETE", { id: itemId }, "second"))).status, 404);
    await bot.POST(botRequest("Marque pasta de dente como comprado", "event-2"));
    await bot.POST(botRequest("Granize, acabou a pasta de dente", "event-1"));
    list = (await (await web.GET(webRequest())).json()).items;
    assert.ok(list[0].completedAt, "reentrega não reabre um item já comprado");
    await bot.POST(botRequest("Acabou a pasta de dente", "event-3"));
    list = (await (await web.GET(webRequest())).json()).items;
    assert.equal(list.length, 1);
    assert.equal(list[0].completedAt, null);
    const audio = await bot.POST(botRequest("Acabou o café", "audio-1", "first-phone", "test-secret", "audio"));
    assert.match((await audio.json()).responseText, /🎙️ Entendi/);
    await web.POST(webRequest("POST", { name: "leite, arroz" }));
    list = (await (await web.GET(webRequest())).json()).items;
    assert.equal(list.length, 4);
    assert.equal((await web.PATCH(webRequest("PATCH", { id: itemId, completed: true }))).status, 200);
    assert.equal((await web.PATCH(webRequest("PATCH", { id: itemId, completed: false }))).status, 200);
    await bot.POST(botRequest("Remova pasta de dente da lista", "event-4"));
    list = (await (await web.GET(webRequest())).json()).items;
    assert.equal(list.length, 3);
    await web.POST(webRequest("POST", { name: "pasta de dente" }));
    assert.equal((await (await web.GET(webRequest())).json()).items.length, 4, "repor um item removido restaura a mesma linha");
    assert.equal(sqlite.prepare("SELECT count(*) AS total FROM shopping_items").get().total, 4);
    assert.equal((await bot.POST(botRequest("Acabou leite", "blocked", "unlinked"))).status, 404);
    assert.equal((await bot.POST(botRequest("Acabou leite", "blocked", "inactive"))).status, 403);
    assert.equal((await bot.POST(botRequest("Lista de compras", "blocked", "first-phone", "wrong"))).status, 401);
    const financial = await bot.POST(botRequest("Gastei 58 no restaurante"));
    assert.deepEqual(await financial.json(), { handled: false });
    const consultation = await bot.POST(botRequest("Lista de compras"));
    assert.match((await consultation.json()).responseText, /pasta de dente/);
    assert.equal((await web.POST(webRequest("POST", { name: "x".repeat(121) }))).status, 400);
    assert.equal((await web.PATCH(webRequest("PATCH", { id: itemId }))).status, 400);
    const unknown = await bot.POST(botRequest("Remova item inexistente da lista"));
    assert.match((await unknown.json()).responseText, /Não encontrei/);
  } finally { delete globalThis.__shoppingDb; sqlite.close(); }
});
