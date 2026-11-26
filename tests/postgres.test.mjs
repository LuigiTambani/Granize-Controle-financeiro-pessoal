import assert from "node:assert/strict";
import test from "node:test";
import { postgresQuery } from "../app/api/_lib/database.ts";

test("PostgreSQL mantém os parâmetros separados e os nomes esperados pela interface", () => {
  assert.equal(postgresQuery("SELECT amount_cents AS amountCents FROM transactions WHERE user_id = ? AND type = ?", 2),
    'SELECT amount_cents AS "amountCents" FROM transactions WHERE user_id = $1 AND type = $2');
  assert.equal(postgresQuery("SELECT '?' AS description, \"?\" FROM transactions -- ?\nWHERE id = ? /* ? */", 1),
    "SELECT '?' AS description, \"?\" FROM transactions -- ?\nWHERE id = $1 /* ? */");
  assert.equal(postgresQuery("SELECT $$?$$, $body$?$body$ WHERE id = ?", 1), "SELECT $$?$$, $body$?$body$ WHERE id = $1");
  assert.equal(postgresQuery("SELECT 'O''Brien ?' AS description", 0), "SELECT 'O''Brien ?' AS description");
  assert.throws(() => postgresQuery("SELECT * FROM users WHERE id = ?", 0), /parâmetros/);
});
