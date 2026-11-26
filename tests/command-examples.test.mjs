import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { parseShoppingCommand } from "../app/lib/shopping.ts";

const source = await readFile(new URL("../app/components/CommandExamples.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  .replaceAll('"react/jsx-runtime"', JSON.stringify(import.meta.resolve("react/jsx-runtime")));
const moduleSource = compiled.replaceAll('"react"', JSON.stringify(import.meta.resolve("react")));
const { default: CommandExamples, commandGroups, commandRows } = await import(`data:text/javascript;base64,${Buffer.from(moduleSource).toString("base64")}`);

test("exemplos aparecem em três faixas contínuas, somente com mensagens", () => {
  const html = renderToStaticMarkup(createElement(CommandExamples));
  assert.equal(commandGroups.length, 3);
  assert.equal(commandGroups.flatMap((group) => group.commands).length, 21);
  assert.equal(commandRows.length, 3);
  assert.ok(commandRows.every((row) => row.length === 7));
  assert.deepEqual(new Set(commandRows.flat()), new Set(commandGroups.flatMap((group) => group.commands)));
  assert.equal((html.match(/class="command-message"/g) || []).length, 42, "uma cópia extra por faixa mantém a rolagem contínua");
  assert.equal((html.match(/class="command-carousel-row"/g) || []).length, 3);
  assert.equal((html.match(/<ul[^>]*aria-hidden="true"/g) || []).length, 3, "as cópias são ocultas de leitores de tela");
  assert.doesNotMatch(html, /Copiar comando|command-conversation|<article|<h3|<footer|Começar agora/);
  assert.doesNotMatch(source, /navigator\.clipboard|command-example-grid|command-copy-status/);
  assert.doesNotMatch(html, /<button|Pausar mensagens|Retomar mensagens|SIMPLES COMO UMA CONVERSA/);
});

test("carrossel mantém pausa por foco ou mouse e respeita movimento reduzido", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /@keyframes command-message-scroll/);
  assert.match(css, /translateX\(-50%\)/);
  assert.match(css, /command-carousel-rows:focus-within/);
  assert.match(css, /animation-play-state:paused/);
  assert.match(css, /prefers-reduced-motion:reduce[^}]*command-carousel/);
  assert.match(css, /command-carousel-track \{ animation:none!important/);
});

test("todos os exemplos são aceitos pelos interpretadores atuais do WhatsApp", async () => {
  const workflow = JSON.parse(await readFile(new URL("../infra/local/n8n/granize-whatsapp.json", import.meta.url), "utf8"));
  const financial = ["Entender comando", "Interpretar variações", "Finalizar lançamento"].map((name) => new Function("$json", workflow.nodes.find((node) => node.name === name).parameters.jsCode));
  for (const group of commandGroups) for (const command of group.commands) {
    const shopping = parseShoppingCommand(command);
    if (group.id === "shopping") {
      assert.ok(shopping && shopping.action !== "help", command);
    } else {
      assert.equal(shopping, null, command);
      let data = { text: command, inputType: "text" };
      for (const interpret of financial) data = interpret(data)[0].json;
      assert.ok(["transaction", "summary"].includes(data.action), command);
      if (command === "Acabei de ganhar 5 mil reais") assert.equal(data.amount, 5000);
    }
  }
});
