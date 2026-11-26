import { ApiError, ensureSchema, errorResponse, getD1, requireSameOrigin, randomToken } from "../../_lib/server";
import { consumeAuthAttempt, createSession, passwordHash, validEmail, validatePassword } from "../_lib";

export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    await ensureSchema();
    const payload = await request.json() as { fullName?: string; email?: string; password?: string };
    const fullName = payload.fullName?.trim().slice(0, 100) || "";
    const email = payload.email?.trim().toLowerCase() || "";
    const password = payload.password || "";
    if (fullName.length < 2) throw new ApiError(400, "Informe seu nome completo.");
    if (!validEmail(email)) throw new ApiError(400, "Informe um e-mail válido.");
    validatePassword(password);
    await consumeAuthAttempt(request, email, "register");
    const exists = await getD1().prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
    if (exists) throw new ApiError(409, "Já existe uma conta com este e-mail.");
    const id = crypto.randomUUID();
    const salt = randomToken(16);
    const hash = await passwordHash(password, salt);
    await getD1().batch([
      getD1().prepare(`INSERT INTO users (id, email, full_name, password_hash, password_salt, onboarding_completed)
        VALUES (?, ?, ?, ?, ?, 1)`).bind(id, email, fullName, hash, salt),
      getD1().prepare(`INSERT INTO subscriptions (user_id, provider, plan, status)
        VALUES (?, 'local', 'trial', 'active')`).bind(id),
    ]);
    return Response.json({ ok: true }, { status: 201, headers: { "Set-Cookie": await createSession(id, request) } });
  } catch (error) { return errorResponse(error); }
}
