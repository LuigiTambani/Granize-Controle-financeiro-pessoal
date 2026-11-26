import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";

const root = new URL("../", import.meta.url);

test("migrações completas preparam um banco novo para a hospedagem", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("PRAGMA foreign_keys = ON");
    const journal = JSON.parse(await readFile(new URL("drizzle/meta/_journal.json", root), "utf8"));
    for (const entry of journal.entries) {
      db.exec(await readFile(new URL(`drizzle/${entry.tag}.sql`, root), "utf8"));
    }
    const columns = db.prepare("PRAGMA table_info(users)").all().map((column) => column.name);
    for (const name of ["google_sub", "profile_completed", "avatar_key", "password_hash"]) assert.ok(columns.includes(name));
    for (const name of ["billing_checkouts", "shopping_items", "whatsapp_user_links", "sessions"]) {
      assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
    }
    db.prepare("INSERT INTO users (id, email, google_sub) VALUES (?, ?, ?)").run("one", "one@example.test", "google-subject");
    assert.throws(() => db.prepare("INSERT INTO users (id, email, google_sub) VALUES (?, ?, ?)").run("two", "two@example.test", "google-subject"), /UNIQUE/);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally { db.close(); }
});

test("hospedagem com migrações gerenciadas não altera estrutura durante requisições", async () => {
  const source = await readFile(new URL("app/api/_lib/server.ts", root), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('import { env } from "./environment";', 'const env = { GRANIZE_MANAGED_SCHEMA: "true", DB: { prepare() { throw new Error("DDL durante requisição"); } } };')
    .replace('import { postgresDatabase } from "./database";', 'const postgresDatabase = () => { throw new Error("Banco real fora do teste"); };')
    .replace('import { profileStorage } from "./storage";', 'const profileStorage = () => { throw new Error("Storage real fora do teste"); };');
  const server = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
  await server.ensureSchema();
});
