import { ApiError, ensureSchema, errorResponse, getD1, runtimeString, sha256 } from "../../_lib/server";
import { normalizeWhatsAppPhone, requireActiveWhatsAppAccess, subscriptionAllowsBot } from "../_lib/whatsapp-access";

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "";
}

export async function POST(request: Request) {
  try {
    const expected = runtimeString("N8N_SHARED_SECRET");
    if (!expected || request.headers.get("x-granize-secret") !== expected) throw new ApiError(401, "Integração não autorizada.");
    await ensureSchema();
    const payload = await request.json() as { phone?: string; text?: string; instanceName?: string };
    const phone = normalizeWhatsAppPhone(payload.phone || "");
    const text = String(payload.text || "").trim();
    if (phone.length < 12 || phone.length > 13) throw new ApiError(400, "Número do WhatsApp inválido.");

    const db = getD1();
    const bot = await db.prepare("SELECT instance_name AS instanceName FROM whatsapp_bot_connections WHERE id = 'primary'").first<{ instanceName: string }>();
    if (bot && payload.instanceName && bot.instanceName !== payload.instanceName) throw new ApiError(403, "Instância não autorizada.");

    const codeMatch = text.toUpperCase().match(/^\s*(?:VINCULAR|CONECTAR)\s+([A-Z2-9]{8})\s*$/);
    if (codeMatch) {
      const token = await db.prepare(`
        SELECT tokens.id, tokens.user_id AS userId, users.full_name AS fullName,
          COALESCE(subscriptions.status, 'inactive') AS subscriptionStatus
        FROM whatsapp_link_tokens AS tokens
        JOIN users ON users.id = tokens.user_id
        LEFT JOIN subscriptions ON subscriptions.user_id = tokens.user_id
        WHERE tokens.token_hash = ? AND tokens.used_at IS NULL AND tokens.expires_at > CURRENT_TIMESTAMP
      `).bind(await sha256(codeMatch[1])).first<{ id: string; userId: string; fullName: string; subscriptionStatus: string }>();
      if (!token) return Response.json({ authorized: false, action: "link_invalid", responseText: "Esse código expirou ou já foi utilizado. Gere um novo QR Code no painel da Granize." });
      if (!subscriptionAllowsBot(token.subscriptionStatus)) {
        return Response.json({ authorized: false, action: "subscription_inactive", responseText: "Seu acesso ao bot não está ativo. Entre no painel da Granize para escolher ou renovar seu plano." });
      }
      const occupied = await db.prepare("SELECT user_id AS userId FROM whatsapp_user_links WHERE phone = ? AND user_id <> ?").bind(phone, token.userId).first();
      if (occupied) return Response.json({ authorized: false, action: "phone_in_use", responseText: "Este número já está conectado a outra conta Granize. Desconecte-o no perfil da conta anterior e tente novamente." });
      await db.batch([
        db.prepare(`INSERT INTO whatsapp_user_links (user_id, phone, verified_at, updated_at)
          VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(user_id) DO UPDATE SET phone = excluded.phone, verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP`)
          .bind(token.userId, phone),
        db.prepare("UPDATE whatsapp_link_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?").bind(token.id),
        db.prepare("UPDATE whatsapp_link_tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND used_at IS NULL").bind(token.userId),
      ]);
      return Response.json({
        authorized: false,
        action: "link_success",
        userId: token.userId,
        responseText: `✅ WhatsApp conectado, ${firstName(token.fullName)}!\n\nAgora você pode enviar textos ou áudios, por exemplo:\n• Gastei 35 no mercado\n• Recebi 2500 de salário\n• Saldo`,
      });
    }

    const access = await requireActiveWhatsAppAccess(phone);
    if (!access.allowed) {
      const responseText = access.reason === "subscription_inactive"
        ? "Seu teste ou assinatura não está ativo. Entre no painel da Granize para renovar o acesso ao bot."
        : "Este número ainda não está conectado à Granize. Entre no painel, abra a conexão do WhatsApp e escaneie seu QR Code exclusivo.";
      return Response.json({ authorized: false, action: access.reason, responseText });
    }
    return Response.json({ authorized: true, action: "continue", userId: access.access.userId, fullName: access.access.fullName });
  } catch (error) {
    return errorResponse(error);
  }
}
