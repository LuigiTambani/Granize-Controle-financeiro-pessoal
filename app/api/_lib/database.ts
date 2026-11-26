import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export type DatabaseResult<T = Record<string, unknown>> = { results: T[]; meta: { changes: number } };
export interface DatabaseStatement {
  bind(...values: unknown[]): DatabaseStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<DatabaseResult<T>>;
  run(): Promise<DatabaseResult>;
}
export interface Database {
  prepare(sql: string): DatabaseStatement;
  batch(statements: DatabaseStatement[]): Promise<DatabaseResult[]>;
}

// Keep parameter values out of SQL text. Preserve quoted strings, identifiers,
// comments and dollar-quoted literals while converting existing bind markers.
export function postgresQuery(sql: string, count: number): string {
  let output = "", index = 0, bind = 0, afterAs = false;
  while (index < sql.length) {
    const rest = sql.slice(index);
    const protectedToken = /^(?:'(?:''|[^'])*'|"(?:""|[^"])*"|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/|\$([A-Za-z_][A-Za-z_0-9]*|)\$[\s\S]*?\$\1\$)/.exec(rest);
    if (protectedToken) { output += protectedToken[0]; index += protectedToken[0].length; afterAs = false; continue; }
    if (rest[0] === "?") { output += `$${++bind}`; index++; afterAs = false; continue; }
    const word = /^[A-Za-z_][A-Za-z_0-9]*/.exec(rest);
    if (word) {
      output += afterAs && /[A-Z]/.test(word[0]) && word[0] !== word[0].toUpperCase() ? `"${word[0]}"` : word[0];
      afterAs = word[0].toUpperCase() === "AS";
      index += word[0].length;
      continue;
    }
    if (!/\s/.test(rest[0])) afterAs = false;
    output += rest[0]; index++;
  }
  if (bind !== count) throw new Error("Quantidade de parâmetros inválida para a consulta.");
  return output;
}

let pool: Pool | undefined;
function databasePool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Banco de dados ainda não configurado.");
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error("Conexão do banco inválida.");
  // pg's connection-string SSL flags can override the explicit TLS policy.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) url.searchParams.delete(key);
  pool = new Pool({
    connectionString: url.toString(), max: 3, idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000, allowExitOnIdle: true,
    ssl: { rejectUnauthorized: true, ca: process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n") || readFileSync(join(process.cwd(), "supabase/certs/prod-ca-2021.crt"), "utf8") },
    options: "-c search_path=granize,pg_catalog -c statement_timeout=15000",
  });
  pool.on("error", () => console.error("Database connection closed unexpectedly"));
  return pool;
}

function normalizeRow(row: QueryResultRow, fields: { name: string; dataTypeID: number }[]) {
  const output = { ...row };
  for (const field of fields) {
    if ([20, 1700].includes(field.dataTypeID) && typeof output[field.name] === "string") {
      const value = Number(output[field.name]);
      if (!Number.isSafeInteger(value)) throw new Error("Valor financeiro fora do intervalo suportado.");
      output[field.name] = value;
    }
  }
  return output;
}

class Statement implements DatabaseStatement {
  readonly sql: string;
  readonly values: unknown[];
  constructor(sql: string, values: unknown[] = []) { this.sql = sql; this.values = values; }
  bind(...values: unknown[]) { return new Statement(this.sql, values); }
  async execute(client: Pool | PoolClient = databasePool()): Promise<DatabaseResult> {
    const result = await client.query(postgresQuery(this.sql, this.values.length), this.values);
    return { results: result.rows.map(row => normalizeRow(row, result.fields)), meta: { changes: result.rowCount ?? 0 } };
  }
  async all<T = Record<string, unknown>>() { return await this.execute() as DatabaseResult<T>; }
  async first<T = Record<string, unknown>>() { return (await this.all<T>()).results[0] ?? null; }
  async run() { return this.execute(); }
}

export function postgresDatabase(): Database {
  return {
    prepare(sql) { return new Statement(sql); },
    async batch(statements) {
      if (statements.some(statement => !(statement instanceof Statement))) throw new Error("Consulta de banco incompatível.");
      const client = await databasePool().connect();
      try {
        await client.query("BEGIN");
        const results = [];
        for (const statement of statements) results.push(await (statement as Statement).execute(client));
        await client.query("COMMIT");
        return results;
      } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
      finally { client.release(); }
    },
  };
}
