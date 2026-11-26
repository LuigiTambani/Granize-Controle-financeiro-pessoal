import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
async function compile(file, imports) {
  let code = ts.transpileModule(await readFile(new URL(file, root), "utf8"), {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
  for (const [from,to] of Object.entries(imports)) code = code.replaceAll(JSON.stringify(from),JSON.stringify(to));
  return dataUrl(code);
}

test("cadastro e login no domínio público criam e revogam sessões sem confiar em cabeçalhos externos", async () => {
  const sqlite = new DatabaseSync(":memory:");
  const statement = (sql, params = []) => ({
    bind(...values) { return statement(sql, values); },
    async first() { return sqlite.prepare(sql).get(...params) || null; },
    async all() { return {results:sqlite.prepare(sql).all(...params)}; },
    async run() { return {meta:{changes:Number(sqlite.prepare(sql).run(...params).changes)}}; },
  });
  const db = {prepare:statement, async batch(statements) {
    sqlite.exec("BEGIN");
    try { const result = []; for (const query of statements) result.push(await query.run()); sqlite.exec("COMMIT"); return result; }
    catch(error) {sqlite.exec("ROLLBACK");throw error;}
  }};
  globalThis.__publicAuthEnv = {DB:db,APP_URL:"https://granize.example"};
  const serverUrl = await compile("app/api/_lib/server.ts", {
    "./environment":dataUrl("export const env=globalThis.__publicAuthEnv;"),
    "./database":dataUrl("export function postgresDatabase(){throw new Error('Banco real fora do teste');}"),
    "./storage":dataUrl("export function profileStorage(){throw new Error('Storage real fora do teste');}"),
  });
  const server = await import(serverUrl);
  await server.ensureSchema();
  sqlite.exec("CREATE TABLE auth_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL)");
  const authUrl = await compile("app/api/auth/_lib.ts", {"../_lib/server":serverUrl});
  const imports = {"../../_lib/server":serverUrl,"../_lib":authUrl};
  const signup = await import(await compile("app/api/auth/register/route.ts", imports));
  const login = await import(await compile("app/api/auth/login/route.ts", imports));
  const logout = await import(await compile("app/api/auth/logout/route.ts", imports));
  const request = (path, body, headers = {}) => new Request(`https://granize.example${path}`, {
    method:"POST",headers:{"content-type":"application/json",origin:"https://granize.example",...headers},body:JSON.stringify(body),
  });
  try {
    const response = await signup.POST(request("/api/auth/register", {fullName:"Conta Teste",email:"user@example.invalid",password:"Senha-teste-123"}));
    assert.equal(response.status,201);
    const cookie = response.headers.get("set-cookie");
    assert.match(cookie,/HttpOnly/); assert.match(cookie,/Secure/); assert.match(cookie,/SameSite=Lax/);
    const user = await server.getRequestUser(new Request("https://granize.example/api/me",{headers:{cookie}}));
    assert.equal(user.email,"user@example.invalid");
    assert.equal(await server.getRequestUser(new Request("https://granize.example/api/me",{headers:{"oai-authenticated-user-id":user.id,"oai-authenticated-user-email":user.email}})),null);
    assert.equal((await login.POST(request("/api/auth/login",{email:user.email,password:"errada"}))).status,401);
    assert.equal((await login.POST(request("/api/auth/login",{email:user.email,password:"Senha-teste-123"},{origin:"https://other.example"}))).status,403);
    assert.equal((await login.POST(request("/api/auth/login",{email:user.email,password:"Senha-teste-123"}))).status,200);
    assert.equal((await logout.POST(request("/api/auth/logout",{},{cookie}))).status,200);
    assert.equal(await server.getRequestUser(new Request("https://granize.example/api/me",{headers:{cookie}})),null);
    for(let index=0;index<21;index++) await login.POST(request("/api/auth/login",{email:user.email,password:"errada"}));
    assert.equal((await login.POST(request("/api/auth/login",{email:user.email,password:"Senha-teste-123"}))).status,429);
  } finally { sqlite.close(); delete globalThis.__publicAuthEnv; }
});
