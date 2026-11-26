export async function verifyStripeSignature(rawBody: string, signature: string, secret: string, now = Date.now()) {
  const parts = signature.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = parts.find(([key]) => key === "t")?.[1] || "";
  if (!/^\d+$/.test(timestamp) || !Number.isFinite(Number(timestamp)) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const signatures = parts.filter(([key, value]) => key === "v1" && /^[a-f0-9]{64}$/.test(value)).map(([, value]) => value);
  if (!signatures.length) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const digest = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((value) => { let difference = 0; for (let i = 0; i < 64; i++) difference |= value.charCodeAt(i) ^ digest.charCodeAt(i); return difference === 0; });
}
