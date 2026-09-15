import { ApiError, ensureSchema, errorResponse, getD1 } from "../../../_lib/server";
import { createSession } from "../../_lib";
import { clearGoogleFlowCookie, googleConfig, readGoogleFlow, verifyGoogleIdToken } from "../_lib";

type Account = { id: string; email: string; googleSub: string | null };

function redirect(request: Request, path: string, cookies: string[] = []) {
  const headers = new Headers({ Location: new URL(path, request.url).toString() });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export async function GET(request: Request) {
  const clearFlow = clearGoogleFlowCookie(request);
  try {
    const url = new URL(request.url);
    const flow = readGoogleFlow(request);
    const code = url.searchParams.get("code") || "";
    if (!flow || !code || url.searchParams.get("state") !== flow.state || url.searchParams.has("error")) {
      throw new ApiError(401, "O acesso com Google foi cancelado ou expirou.");
    }
    const config = googleConfig(request);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: flow.verifier,
      }),
    });
    const token = await tokenResponse.json() as { id_token?: string; error_description?: string };
    if (!tokenResponse.ok || !token.id_token) throw new ApiError(401, token.error_description || "O Google não confirmou o acesso.");
    const google = await verifyGoogleIdToken(token.id_token, config.clientId, flow.nonce);
    await ensureSchema();
    const db = getD1();
    let createdAccount = false;
    let account = await db.prepare("SELECT id, email, google_sub AS googleSub FROM users WHERE google_sub = ?").bind(google.sub).first<Account>();
    if (!account) {
      account = await db.prepare("SELECT id, email, google_sub AS googleSub FROM users WHERE email = ?").bind(google.email).first<Account>();
      if (account?.googleSub && account.googleSub !== google.sub) throw new ApiError(409, "Este e-mail já está vinculado a outra conta Google.");
      if (account) {
        await db.prepare("UPDATE users SET google_sub = ?, full_name = CASE WHEN full_name = '' THEN ? ELSE full_name END, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(google.sub, google.name, account.id).run();
      } else {
        const id = crypto.randomUUID();
        await db.batch([
          db.prepare("INSERT INTO users (id, email, full_name, google_sub, onboarding_completed, profile_completed) VALUES (?, ?, ?, ?, 0, 0)")
            .bind(id, google.email, google.name, google.sub),
          db.prepare("INSERT INTO subscriptions (user_id, provider, plan, status) VALUES (?, 'google', ?, ?)")
            .bind(id, flow.plan, flow.plan === "trial" ? "active" : "inactive"),
        ]);
        account = { id, email: google.email, googleSub: google.sub };
        createdAccount = true;
      }
    }
    const appSession = await createSession(account.id, request);
    const destination = createdAccount
      ? "/?google=success&complete_profile=1"
      : "/?google=success";
    return redirect(request, destination, [clearFlow, appSession]);
  } catch (error) {
    console.error(error);
    const response = errorResponse(error);
    const status = response.status;
    return redirect(request, `/?google=${status === 503 ? "not_configured" : "failed"}`, [clearFlow]);
  }
}
