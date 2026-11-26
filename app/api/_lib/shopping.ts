import { ApiError } from "./server";
import type { Database, DatabaseStatement } from "./database";
import { formatShoppingList, shoppingKey, type ShoppingCommand, type ShoppingItem } from "../../lib/shopping";

export async function shoppingItems(db: Database, userId: string): Promise<ShoppingItem[]> {
  const { results } = await db.prepare(`SELECT id, name, completed_at AS completedAt, source, created_at AS createdAt
    FROM shopping_items WHERE user_id = ? AND deleted_at IS NULL
    ORDER BY completed_at IS NOT NULL, created_at DESC, lower(name), id`).bind(userId).all<ShoppingItem>();
  return results;
}

export async function applyShoppingCommand(db: Database, userId: string, command: ShoppingCommand, source: "manual" | "whatsapp", externalId?: string) {
  if (command.action === "help") return command.message;
  if (command.action === "list") return formatShoppingList(await shoppingItems(db, userId));
  if (externalId) {
    const previous = await db.prepare("SELECT response_text AS responseText FROM shopping_events WHERE user_id = ? AND message_id = ?").bind(userId, externalId).first<{ responseText: string }>();
    if (previous) return previous.responseText;
  }
  const statements: DatabaseStatement[] = [];
  const updated: string[] = [], missing: string[] = [];
  const existing = command.action === "add" ? [] : await shoppingItems(db, userId);
  for (const name of command.items) {
    if (command.action === "add") {
      statements.push(db.prepare(`INSERT INTO shopping_items (id, user_id, name, normalized_name, source) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, normalized_name) DO UPDATE SET name = excluded.name, source = excluded.source,
          completed_at = NULL, deleted_at = NULL, updated_at = CURRENT_TIMESTAMP`).bind(crypto.randomUUID(), userId, name, shoppingKey(name), source));
      updated.push(name);
    } else {
      const item = existing.find((item) => shoppingKey(item.name) === shoppingKey(name));
      if (!item) { missing.push(name); continue; }
      statements.push(command.action === "complete"
        ? db.prepare("UPDATE shopping_items SET completed_at = COALESCE(completed_at, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND deleted_at IS NULL").bind(new Date().toISOString(), item.id, userId)
        : db.prepare("UPDATE shopping_items SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ? AND deleted_at IS NULL").bind(item.id, userId));
      updated.push(item.name);
    }
  }
  const heading = command.action === "add" ? "🛒 Adicionado à sua lista:" : command.action === "complete" ? "✅ Marcado como comprado:" : "🗑️ Removido da sua lista:";
  const responseText = `${updated.length ? `${heading}\n${updated.map((name) => `• ${name}`).join("\n")}` : "Nenhum item foi alterado."}${missing.length ? `\n\nNão encontrei na sua lista:\n${missing.map((name) => `• ${name}`).join("\n")}` : ""}\n\nEnvie *lista de compras* para consultar seus itens.${command.action === "complete" ? "\nIsso não registra uma despesa. Para registrar o gasto, informe o valor em outra mensagem." : ""}`;
  if (externalId) statements.push(db.prepare("INSERT INTO shopping_events (user_id, message_id, response_text) VALUES (?, ?, ?)").bind(userId, externalId, responseText));
  if (statements.length) {
    try { await db.batch(statements); }
    catch (error) {
      if (externalId) {
        const previous = await db.prepare("SELECT response_text AS responseText FROM shopping_events WHERE user_id = ? AND message_id = ?").bind(userId, externalId).first<{ responseText: string }>();
        if (previous) return previous.responseText;
      }
      throw error;
    }
  }
  return responseText;
}

export async function changeShoppingItem(db: Database, userId: string, id: unknown, completed?: unknown) {
  if (typeof id !== "string" || !id || id.length > 100) throw new ApiError(400, "Item inválido.");
  if (completed !== undefined && typeof completed !== "boolean") throw new ApiError(400, "Estado do item inválido.");
  const existing = await db.prepare("SELECT id FROM shopping_items WHERE user_id = ? AND id = ? AND deleted_at IS NULL").bind(userId, id).first();
  if (!existing) throw new ApiError(404, "Item não encontrado.");
  await db.prepare(completed === undefined
    ? "UPDATE shopping_items SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND deleted_at IS NULL"
    : `UPDATE shopping_items SET completed_at = ${completed ? "CURRENT_TIMESTAMP" : "NULL"}, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND id = ? AND deleted_at IS NULL`).bind(userId, id).run();
}
