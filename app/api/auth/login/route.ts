import { ApiError, ensureSchema, errorResponse, getD1 } from "../../_lib/server";
import { createSession, passwordHash, validEmail } from "../_lib";

type Account = { id: string; passwordHash: string | null; passwordSalt: string | null };

export async function POST(request: Request) {
  try {
    await ensureSchema();
    const payload = await request.json() as { email?: string; password?: string };
    const email = payload.email?.trim().toLowerCase() || "";
    const password = payload.password || "";
    if (!validEmail(email) || !password) throw new ApiError(400, "Informe e-mail e senha.");
    const account = await getD1().prepare(`SELECT id, password_hash AS passwordHash, password_salt AS passwordSalt
      FROM users WHERE email = ?`).bind(email).first<Account>();
    if (!account?.passwordHash || !account.passwordSalt || await passwordHash(password, account.passwordSalt) !== account.passwordHash) {
      throw new ApiError(401, "E-mail ou senha incorretos.");
    }
    return Response.json({ ok: true }, { headers: { "Set-Cookie": await createSession(account.id, request) } });
  } catch (error) { return errorResponse(error); }
}
