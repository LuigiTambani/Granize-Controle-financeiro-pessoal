import { ApiError, getD1, randomToken, sessionCookie, sha256 } from "../_lib/server";

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function passwordHash(password: string, saltHex: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)?.map((value) => Number.parseInt(value, 16)) || []);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 210000 }, key, 256);
  return toHex(new Uint8Array(bits));
}

export function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 160;
}

export async function createSession(userId: string, request: Request) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await getD1().prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, expiresAt).run();
  return sessionCookie(token, request);
}

export function validatePassword(password: string) {
  if (password.length < 8) throw new ApiError(400, "A senha precisa ter pelo menos 8 caracteres.");
  if (password.length > 128) throw new ApiError(400, "A senha é muito longa.");
}
