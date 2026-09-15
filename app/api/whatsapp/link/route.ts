import QRCode from "qrcode";
import { ApiError, ensureSchema, errorResponse, getD1, requireApiUser, sha256 } from "../../_lib/server";
import { normalizeWhatsAppPhone, subscriptionAllowsBot } from "../../integrations/_lib/whatsapp-access";

const LINK_MINUTES = 10;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function linkCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("");
}

async function accountState(userId: string) {
  const db = getD1();
  const profile = await db.prepare("SELECT profile_completed AS profileCompleted FROM users WHERE id = ?").bind(userId).first<{ profileCompleted: number }>();
  const subscription = await db.prepare("SELECT plan, status FROM subscriptions WHERE user_id = ?").bind(userId).first<{ plan: string; status: string }>();
  const bot = await db.prepare("SELECT instance_name AS instanceName, status, phone FROM whatsapp_bot_connections WHERE id = 'primary'").first<{ instanceName: string; status: string; phone: string | null }>();
  const link = await db.prepare("SELECT phone, verified_at AS verifiedAt FROM whatsapp_user_links WHERE user_id = ?").bind(userId).first<{ phone: string; verifiedAt: string }>();
  return { profile, subscription, bot, link };
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    await ensureSchema();
    const state = await accountState(user.id);
    return Response.json({
      linked: Boolean(state.link),
      link: state.link || null,
      bot: state.bot || null,
      eligible: Boolean(state.profile?.profileCompleted && subscriptionAllowsBot(state.subscription?.status)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    await ensureSchema();
    const state = await accountState(user.id);
    if (!state.profile?.profileCompleted) throw new ApiError(409, "Complete seu cadastro antes de conectar o WhatsApp.");
    if (!subscriptionAllowsBot(state.subscription?.status)) throw new ApiError(403, "Ative seu teste ou assinatura para usar o bot do WhatsApp.");
    if (state.link) return Response.json({ linked: true, link: state.link });

    const botPhone = normalizeWhatsAppPhone(state.bot?.phone || "");
    if (!state.bot || !["open", "connected", "online"].includes(state.bot.status.toLowerCase()) || !botPhone) {
      throw new ApiError(409, "O WhatsApp oficial da Granize precisa ser conectado primeiro.");
    }

    const code = linkCode();
    const expiresAt = new Date(Date.now() + LINK_MINUTES * 60_000).toISOString();
    const db = getD1();
    await db.batch([
      db.prepare("UPDATE whatsapp_link_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL").bind(user.id),
      db.prepare("INSERT INTO whatsapp_link_tokens (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), user.id, await sha256(code), expiresAt),
    ]);
    const message = `VINCULAR ${code}`;
    const whatsappUrl = `https://wa.me/${botPhone}?text=${encodeURIComponent(message)}`;
    const qrCode = await QRCode.toDataURL(whatsappUrl, {
      errorCorrectionLevel: "M",
      width: 320,
      margin: 2,
      color: { dark: "#08243D", light: "#FFFFFF" },
    });
    return Response.json({ linked: false, code, expiresAt, whatsappUrl, qrCode });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser(request);
    await ensureSchema();
    const db = getD1();
    await db.batch([
      db.prepare("DELETE FROM whatsapp_user_links WHERE user_id = ?").bind(user.id),
      db.prepare("UPDATE whatsapp_link_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL").bind(user.id),
    ]);
    return Response.json({ disconnected: true });
  } catch (error) {
    return errorResponse(error);
  }
}
