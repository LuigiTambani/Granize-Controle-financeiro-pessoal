import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("renderiza a página inicial do Granize", async () => {
  const html = await readFile(new URL("../.next/server/app/index.html", import.meta.url), "utf8");
  assert.match(html, /Granize \| Controle financeiro/);
  assert.match(html, /Controle financeiro/);
  assert.doesNotMatch(html, /Sprint\s*1/i);
});

test("mantém as funcionalidades solicitadas no produto", async () => {
  const [page, schema] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
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

test("visão geral sem frases auxiliares nem lista de lançamentos recentes", async () => {
  const [page, charts] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/components/FinancialOverview.tsx", root), "utf8"),
  ]);
  assert.doesNotMatch(page, /Aqui está seu resumo financeiro atualizado/);
  assert.doesNotMatch(page, /Lançamentos recentes/);
  assert.doesNotMatch(charts, /SEU DINHEIRO, MAIS CLARO/);
  assert.match(page, /OverviewMonthSelector/);
  assert.match(page, /\/api\/dashboard\?month=/);
  assert.match(charts, /type="month"/);
  assert.match(charts, /aria-label="Mês anterior"/);
  assert.match(charts, /aria-label="Próximo mês"/);
  assert.match(page, /title="Todos os lançamentos"/);
});

test("landing mantém fundo uniforme e suaviza as bordas da imagem sem trocar a arte", async () => {
  const [styles, page] = await Promise.all([
    readFile(new URL("app/globals.css", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
  ]);
  assert.match(styles, /\.landing-page \{ --landing-surface:#fff;/);
  assert.match(styles, /\.landing-page \.reference-landing \{ background:var\(--landing-surface\); \}/);
  assert.match(styles, /--hero-horizontal-mask:linear-gradient\(to right,transparent 0%,#000 22%/);
  assert.match(styles, /--hero-vertical-mask:linear-gradient\(to bottom,transparent 0%,#000 8%,#000 93%,transparent 100%\)/);
  assert.match(styles, /mask-composite:intersect/);
  assert.match(styles, /-webkit-mask-composite:source-in/);
  assert.match(styles, /\.command-examples \{[^}]*background:var\(--landing-surface,#fff\)/);
  assert.match(page, /src="\/hero-granize\.png"/);
});

test("plano gratuito é permanente, sem cartão e sem cobrança automática", async () => {
  const [page, registration, googleCallback] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/auth/register/route.ts", root), "utf8"),
    readFile(new URL("app/api/auth/google/callback/route.ts", root), "utf8"),
  ]);
  assert.match(page, /name: "Grátis"/);
  assert.match(page, /cycle: "para sempre"/);
  assert.match(page, /note: "Sem prazo para acabar"/);
  assert.match(page, /Plano Grátis/);
  assert.doesNotMatch(page, /Teste grátis|Conheça antes de assinar/);
  assert.match(page, /if \(isTrial\) \{\s*onDashboard\(\);\s*return;/);
  assert.match(registration, /VALUES \(\?, 'local', 'trial', 'active'\)/);
  assert.doesNotMatch(registration, /current_period_end|trial_end|stripe\.com/);
  assert.match(googleCallback, /VALUES \(\?, 'google', 'trial', 'active'\)/);
});
