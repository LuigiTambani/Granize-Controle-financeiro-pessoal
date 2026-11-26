import { ApiError, isLocalRequest, publicOrigin, randomToken, runtimeString } from "../../_lib/server";

export type GoogleFlow = { state: string; nonce: string; verifier: string; mode: "login" | "register"; plan: string };

const FLOW_COOKIE = "granize_google_flow";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function decodeBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function googleConfig(request: Request) {
  const clientId = runtimeString("GOOGLE_CLIENT_ID");
  const clientSecret = runtimeString("GOOGLE_CLIENT_SECRET");
  const configuredRedirect = runtimeString("GOOGLE_REDIRECT_URI");
  const redirectUri = configuredRedirect || new URL("/api/auth/google/callback", publicOrigin(request)).toString();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new ApiError(503, "Login com Google ainda não configurado.");
  }
  if (!isLocalRequest(request) && new URL(redirectUri).origin !== publicOrigin(request)) throw new ApiError(503, "Login com Google ainda não configurado.");
  return { clientId, clientSecret, redirectUri };
}

export async function createGoogleFlow(mode: "login" | "register", plan: string) {
  const verifier = randomToken(32);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return {
    flow: { state: randomToken(24), nonce: randomToken(24), verifier, mode, plan } satisfies GoogleFlow,
    challenge: base64Url(new Uint8Array(digest)),
  };
}

export function googleFlowCookie(flow: GoogleFlow, request: Request, maxAge = 600) {
  const value = base64Url(new TextEncoder().encode(JSON.stringify(flow)));
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return `${FLOW_COOKIE}=${value}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function clearGoogleFlowCookie(request: Request) {
  const secure = isLocalRequest(request) ? "" : "; Secure";
  return `${FLOW_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readGoogleFlow(request: Request): GoogleFlow | null {
  const encoded = request.headers.get("cookie")?.split(";").map((item) => item.trim())
    .find((item) => item.startsWith(`${FLOW_COOKIE}=`))?.slice(FLOW_COOKIE.length + 1);
  if (!encoded) return null;
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(encoded))) as GoogleFlow;
  } catch { return null; }
}

export async function verifyGoogleIdToken(idToken: string, clientId: string, nonce: string) {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new ApiError(401, "Resposta de login inválida.");
  const header = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0]))) as { alg?: string; kid?: string };
  const claims = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1]))) as {
    iss?: string; aud?: string | string[]; exp?: number; nonce?: string; sub?: string;
    email?: string; email_verified?: boolean; name?: string;
  };
  if (header.alg !== "RS256" || !header.kid) throw new ApiError(401, "Assinatura de login inválida.");
  const response = await fetch("https://www.googleapis.com/oauth2/v3/certs");
  if (!response.ok) throw new ApiError(502, "Não foi possível validar o acesso com o Google.");
  const jwks = await response.json() as { keys?: (JsonWebKey & { kid?: string })[] };
  const jwk = jwks.keys?.find((key) => key.kid === header.kid);
  if (!jwk) throw new ApiError(401, "Chave de autenticação do Google não encontrada.");
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, decodeBase64Url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!valid || !["accounts.google.com", "https://accounts.google.com"].includes(claims.iss || "") || !audience.includes(clientId)
    || !claims.exp || claims.exp * 1000 <= Date.now() || claims.nonce !== nonce || !claims.sub || !claims.email || claims.email_verified !== true) {
    throw new ApiError(401, "Não foi possível confirmar sua conta Google.");
  }
  return { sub: claims.sub, email: claims.email.toLowerCase(), name: claims.name?.trim().slice(0, 100) || "" };
}
