import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("renderiza a página inicial do Granize", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Granize \| Controle financeiro/);
  assert.match(html, /Controle financeiro/);
  assert.doesNotMatch(html, /Sprint\s*1/i);
});

test("mantém as funcionalidades solicitadas no produto", async () => {
  const [page, schema] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("database/schema.ts", root), "utf8"),
  ]);
  for (const label of ["Visão geral", "Lançamentos", "Relatórios", "Perfil", "Período"]) assert.match(page, new RegExp(label));
  assert.doesNotMatch(page, /\["overview", "transactions", "reminders"/);
  assert.match(page, /Conecte seu número ao bot Granize/);
  assert.match(page, /whatsapp-logo\.svg/);
  assert.match(page, /A foto é salva automaticamente/);
  assert.match(page, /profile\.avatarVersion/);
  assert.match(page, /Desconectar da conta/);
  assert.match(page, /Continuar com Google/);
  assert.match(page, /\/api\/auth\/google\/start/);
  assert.match(page, /google-g\.png/);
  assert.match(schema, /export const reminders/);
  assert.match(schema, /export const sessions/);
});

test("oculta os elementos auxiliares removidos da interface", async () => {
  const [styles, page] = await Promise.all([
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(styles, /\.modal > \.eyebrow,\.photo-actions > small \{ display:none; \}/);
  assert.doesNotMatch(page, /Acesso seguro/);
  assert.doesNotMatch(page, /Sessão protegida/);
  assert.doesNotMatch(page, /A senha nunca é salva em texto legível/);
  assert.doesNotMatch(page, /Conta protegida/);
  assert.doesNotMatch(page, /Dados separados por usuário/);
  assert.match(page, /profile-footer/);
  assert.match(page, /Seus dados protegidos\. Sua vida financeira só para você\./);
});

test("aplica a identidade visual Granize em todas as áreas", async () => {
  const [brand, page, terms, privacy, layout] = await Promise.all([
    readFile(new URL("app/components/Brand.tsx", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/termos/page.tsx", root), "utf8"),
    readFile(new URL("app/privacidade/page.tsx", root), "utf8"),
    readFile(new URL("app/layout.tsx", root), "utf8"),
  ]);
  assert.match(brand, /granize-lockup\.png/);
  assert.match(brand, /granize-lockup-inverse\.png/);
  assert.match(page, /<Brand hero/);
  assert.match(terms, /<Brand/);
  assert.match(privacy, /<Brand/);
  assert.match(layout, /granize-mark\.png/);
});

test("mantém a mensagem do Google simples para o usuário", async () => {
  const googleAuth = await readFile(new URL("app/api/auth/google/_lib.ts", root), "utf8");
  assert.match(googleAuth, /Login com Google ainda não configurado\./);
  assert.doesNotMatch(googleAuth, /Informe GOOGLE_CLIENT_ID/);
});
