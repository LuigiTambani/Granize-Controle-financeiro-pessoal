import assert from "node:assert/strict";
import test from "node:test";
import { formatShoppingList, parseShoppingCommand, shoppingKey, shoppingNames } from "../app/lib/shopping.ts";

test("interpreta o exemplo da Rafaella e variações de produtos em falta", () => {
  for (const text of ["Granize, acabou a pasta de dente.", "Acabou a pasta de dente", "Está faltando a pasta de dente", "Preciso comprar pasta de dente"]) {
    assert.deepEqual(parseShoppingCommand(text), { action: "add", items: ["pasta de dente"] });
  }
  assert.deepEqual(parseShoppingCommand("Adicione 2 caixas de leite, arroz e café à lista de compras"), { action: "add", items: ["2 caixas de leite", "arroz", "café"] });
  assert.deepEqual(parseShoppingCommand("Coloque o leite na minha lista"), { action: "add", items: ["leite"] });
});

test("consulta, marca e remove somente com intenção explícita de lista", () => {
  for (const text of ["Lista de compras", "Minha lista", "O que preciso comprar?", "Me mostre a lista de compras"]) assert.equal(parseShoppingCommand(text)?.action, "list");
  assert.deepEqual(parseShoppingCommand("Marque leite como comprado"), { action: "complete", items: ["leite"] });
  assert.deepEqual(parseShoppingCommand("Já comprei o leite da lista"), { action: "complete", items: ["leite"] });
  assert.deepEqual(parseShoppingCommand("Remova o arroz da minha lista de compras"), { action: "remove", items: ["arroz"] });
  for (const text of ["Gastei 58 no restaurante", "Comprei leite por 20 reais", "Recebi 2500 de salário", "Acabei de ganhar 5 mil reais", "Saldo", "Resumo", "oi"]) assert.equal(parseShoppingCommand(text), null, text);
});

test("normaliza duplicados e valida produtos sem descartar texto silenciosamente", () => {
  assert.equal(shoppingKey("  CAFÉ  "), "cafe");
  assert.deepEqual(shoppingNames("Café, café, CAFÉ; leite e arroz"), ["CAFÉ", "leite", "arroz"]);
  for (const value of ["  ", "x".repeat(121), Array.from({ length: 31 }, (_, i) => `item ${i}`).join(",")]) assert.throws(() => shoppingNames(value));
  assert.equal(parseShoppingCommand(`Acabou ${"x".repeat(121)}`)?.action, "help");
});

test("lista enviada no WhatsApp mostra apenas pendentes e informa quando está vazia", () => {
  const items = [{ id: "1", name: "pasta de dente", completedAt: null, source: "whatsapp" }, { id: "2", name: "leite", completedAt: "2026-11-11", source: "manual" }];
  const text = formatShoppingList(items);
  assert.match(text, /1 item pendente/);
  assert.match(text, /1\. pasta de dente/);
  assert.doesNotMatch(text, /2\. leite/);
  assert.match(formatShoppingList([]), /em dia/);
});
