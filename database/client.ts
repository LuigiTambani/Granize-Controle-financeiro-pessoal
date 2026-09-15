import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) {
    throw new Error(
      "O banco D1 não está disponível. Configure o binding `DB` antes de iniciar o Granize."
    );
  }

  return drizzle(env.DB, { schema });
}
