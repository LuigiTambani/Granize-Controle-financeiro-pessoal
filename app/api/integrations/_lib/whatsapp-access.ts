import { getD1 } from "../../_lib/server";

export function normalizeWhatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export function subscriptionAllowsBot(status: string | null | undefined) {
  return ["active", "trialing"].includes(String(status || "").toLowerCase());
}

export type WhatsAppAccess = {
  userId: string;
  fullName: string;
  phone: string;
  plan: string;
  subscriptionStatus: string;
};

export async function findWhatsAppAccess(phone: string) {
  const normalized = normalizeWhatsAppPhone(phone);
  if (normalized.length < 12 || normalized.length > 13) return null;
  return getD1().prepare(`
    SELECT links.user_id AS userId, users.full_name AS fullName, links.phone,
      COALESCE(subscriptions.plan, 'none') AS plan,
      COALESCE(subscriptions.status, 'inactive') AS subscriptionStatus
    FROM whatsapp_user_links AS links
    JOIN users ON users.id = links.user_id
    LEFT JOIN subscriptions ON subscriptions.user_id = links.user_id
    WHERE links.phone = ?
  `).bind(normalized).first<WhatsAppAccess>();
}

export async function requireActiveWhatsAppAccess(phone: string) {
  const access = await findWhatsAppAccess(phone);
  if (!access) return { allowed: false as const, reason: "not_linked" as const, access: null };
  if (!subscriptionAllowsBot(access.subscriptionStatus)) {
    return { allowed: false as const, reason: "subscription_inactive" as const, access };
  }
  return { allowed: true as const, reason: "active" as const, access };
}
