import { ApiError, ensureSchema, errorResponse, getD1, normalizeEvolutionUrl, publicOrigin, requireApiUser, runtimeString } from "../../_lib/server";
import { normalizeWhatsAppPhone } from "../../integrations/_lib/whatsapp-access";

type BotConnection = { instanceName: string; status: string; phone: string | null };

function evolutionConfig() {
  const baseUrl = normalizeEvolutionUrl(runtimeString("EVOLUTION_API_URL"));
  const apiKey = runtimeString("EVOLUTION_API_KEY");
  const webhookSecret = runtimeString("EVOLUTION_WEBHOOK_SECRET");
  if (!baseUrl || !apiKey || !webhookSecret) throw new ApiError(503, "A conexão do WhatsApp ainda está sendo preparada.");
  return { baseUrl, apiKey, webhookSecret };
}

async function evoFetch(url: string, apiKey: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", apikey: apiKey, ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    const rawMessage = body.message;
    throw new ApiError(response.status >= 500 ? 502 : 400, typeof rawMessage === "string" ? rawMessage : `O WhatsApp respondeu com erro ${response.status}.`);
  }
  return body;
}

function valueAt(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (typeof record[key] === "string") return record[key] as string;
  return "";
}

function instanceRecordName(record: Record<string, unknown>) {
  const nested = record.instance && typeof record.instance === "object" ? record.instance as Record<string, unknown> : {};
  return valueAt(record, ["name", "instanceName"]) || valueAt(nested, ["instanceName", "name"]);
}

function instanceRecordPhone(record: Record<string, unknown>) {
  const nested = record.instance && typeof record.instance === "object" ? record.instance as Record<string, unknown> : {};
  return normalizeWhatsAppPhone(valueAt(record, ["ownerJid", "owner", "number"]) || valueAt(nested, ["ownerJid", "owner", "number"]));
}

async function refreshBot(config: ReturnType<typeof evolutionConfig>, row: BotConnection) {
  const state = await evoFetch(`${config.baseUrl}/instance/connectionState/${encodeURIComponent(row.instanceName)}`, config.apiKey).catch(() => null);
  const stateInstance = state?.instance && typeof state.instance === "object" ? state.instance as Record<string, unknown> : {};
  const status = valueAt(stateInstance, ["state", "status"]) || valueAt(state || {}, ["state", "status"]) || row.status;
  let phone = row.phone || "";
  if (["open", "connected", "online"].includes(status.toLowerCase()) && !phone) {
    const fetched = await evoFetch(`${config.baseUrl}/instance/fetchInstances`, config.apiKey).catch(() => null);
    const records = Array.isArray(fetched) ? fetched as Record<string, unknown>[] : [];
    const match = records.find((record) => instanceRecordName(record) === row.instanceName);
    if (match) phone = instanceRecordPhone(match);
  }
  if (status !== row.status || phone !== (row.phone || "")) {
    await getD1().prepare("UPDATE whatsapp_bot_connections SET status = ?, phone = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 'primary'").bind(status, phone || null).run();
  }
  return { ...row, status, phone: phone || null };
}

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    await ensureSchema();
    const configured = Boolean(runtimeString("EVOLUTION_API_URL") && runtimeString("EVOLUTION_API_KEY") && runtimeString("EVOLUTION_WEBHOOK_SECRET"));
    const row = await getD1().prepare("SELECT instance_name AS instanceName, status, phone FROM whatsapp_bot_connections WHERE id = 'primary'").first<BotConnection>();
    if (!row || !configured) return Response.json({ connection: row || null, configured });
    return Response.json({ connection: await refreshBot(evolutionConfig(), row), configured: true });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    await requireApiUser(request);
    await ensureSchema();
    const config = evolutionConfig();
    const db = getD1();
    const existing = await db.prepare("SELECT instance_name AS instanceName FROM whatsapp_bot_connections WHERE id = 'primary'").first<{ instanceName: string }>();
    const instanceName = existing?.instanceName || runtimeString("GRANIZE_BOT_INSTANCE_NAME") || "granize-bot";
    let response: Record<string, unknown>;
    if (existing) {
      response = await evoFetch(`${config.baseUrl}/instance/connect/${encodeURIComponent(instanceName)}`, config.apiKey);
    } else {
      const webhookBaseUrl = normalizeEvolutionUrl(runtimeString("EVOLUTION_WEBHOOK_BASE_URL") || publicOrigin(request));
      response = await evoFetch(`${config.baseUrl}/instance/create`, config.apiKey, {
        method: "POST",
        body: JSON.stringify({
          instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS",
          webhook: { enabled: true, url: `${webhookBaseUrl}/api/evolution/webhook?token=${encodeURIComponent(config.webhookSecret)}`, webhookByEvents: false, webhookBase64: false, events: ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"] },
        }),
      });
    }
    await db.prepare(`INSERT INTO whatsapp_bot_connections (id, instance_name, status) VALUES ('primary', ?, 'connecting')
      ON CONFLICT(id) DO UPDATE SET instance_name = excluded.instance_name, status = 'connecting', updated_at = CURRENT_TIMESTAMP`).bind(instanceName).run();
    const qr = (response.qrcode && typeof response.qrcode === "object" ? response.qrcode : response) as Record<string, unknown>;
    const base64 = typeof qr.base64 === "string" ? qr.base64 : typeof qr.code === "string" && qr.code.startsWith("data:image") ? qr.code : null;
    return Response.json({ instanceName, status: "connecting", qrCode: base64, pairingCode: typeof qr.pairingCode === "string" ? qr.pairingCode : null });
  } catch (error) { return errorResponse(error); }
}
