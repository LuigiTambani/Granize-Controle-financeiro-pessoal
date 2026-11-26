export type ShoppingItem = {
  id: string;
  name: string;
  completedAt: string | null;
  source: "manual" | "whatsapp";
  createdAt: string;
};

export type ShoppingCommand =
  | { action: "list" }
  | { action: "add" | "complete" | "remove"; items: string[] }
  | { action: "help"; message: string };

export const SHOPPING_HELP = "Para sua lista de compras, envie:\n• Acabou a pasta de dente\n• Adicione leite e arroz à lista de compras\n• Lista de compras\n• Marque leite como comprado\n• Remova arroz da lista";

export function shoppingKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
}

export function shoppingNames(value: string): string[] {
  const names = value.split(/[,;\n]+|\s+e\s+/i).map((name) => name
    .replace(/^[\s:–—-]+|[\s.!?]+$/g, "")
    .replace(/^(?:o|a|os|as|um|uma|uns|umas)\s+/i, "")
    .replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!names.length || names.length > 30 || names.some((name) => name.length > 120 || Array.from(name).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) {
    throw new Error("Informe de 1 a 30 produtos, com até 120 caracteres por item.");
  }
  return [...new Map(names.map((name) => [shoppingKey(name), name])).values()];
}

export function parseShoppingCommand(input: string): ShoppingCommand | null {
  const text = input.trim().replace(/^granize\s*[,!:.-]?\s*/i, "").replace(/[.!?]+$/, "").trim();
  const normalized = shoppingKey(text);
  if (/^(?:(?:me\s+)?(?:mostr[ae]|envie|mande|ver|consultar)\s+(?:a\s+)?)?(?:minha\s+)?lista(?:\s+de\s+compras)?$/.test(normalized)
    || /^(?:o que (?:eu )?(?:preciso|falta|falta eu) comprar|quais (?:os )?(?:produtos|itens) (?:da|na) (?:minha )?lista(?: de compras)?)$/.test(normalized)) {
    return { action: "list" };
  }
  let action: "add" | "complete" | "remove" = "add";
  let match = text.match(/^(?:marque|marcar)\s+(.+?)\s+como\s+comprad[oa]s?$/i);
  if (match) action = "complete";
  if (!match) {
    match = text.match(/^(?:já\s+|ja\s+)?comprei\s+(.+?)\s+d[ae]\s+(?:minha\s+)?lista(?:\s+de\s+compras)?$/i);
    if (match) action = "complete";
  }
  if (!match) {
    match = text.match(/^(?:remova|remover|tire|tirar|exclua|excluir)\s+(.+?)\s+d[ae]\s+(?:minha\s+)?lista(?:\s+de\s+compras)?$/i);
    if (match) action = "remove";
  }
  if (!match) match = text.match(/^(?:adicione|adicionar|inclua|incluir|coloque|colocar)\s+(.+?)\s+(?:à|a|na|em)\s+(?:minha\s+)?lista(?:\s+de\s+compras)?$/i);
  if (!match) match = text.match(/^(?:acabou|acabaram|faltou|faltaram|(?:está|esta|estão|estao|tá|ta)\s+faltando|(?:eu\s+)?preciso\s+comprar|precisamos\s+comprar)\s+(.+)$/i);
  if (!match) {
    if (/\blista(?: de compras)?\b/.test(normalized) && /\b(compras|adicione|adicionar|inclua|coloque|remova|exclua|marque|comprado)\b/.test(normalized)) return { action: "help", message: SHOPPING_HELP };
    return null;
  }
  try { return { action, items: shoppingNames(match[1]) }; }
  catch (error) { return { action: "help", message: `${error instanceof Error ? error.message : "Informe os produtos."}\n\n${SHOPPING_HELP}` }; }
}

export function formatShoppingList(items: ShoppingItem[]) {
  const pending = items.filter((item) => !item.completedAt);
  if (!pending.length) return "🛒 Sua lista de compras está em dia!\n\nPara adicionar algo, envie: *Acabou a pasta de dente*.";
  return `🛒 *Sua lista de compras*\n${pending.length} ${pending.length === 1 ? "item pendente" : "itens pendentes"}\n\n${pending.slice(0, 50).map((item, index) => `${index + 1}. ${item.name}`).join("\n")}${pending.length > 50 ? `\n\nMais ${pending.length - 50} itens disponíveis no site da Granize.` : ""}\n\nDepois de comprar, envie: *Marque ${pending[0].name} como comprado*.\nVocê também pode gerenciar sua lista pelo site.`;
}
