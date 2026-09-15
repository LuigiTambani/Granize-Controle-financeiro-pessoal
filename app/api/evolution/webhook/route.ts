import { ApiError, errorResponse, getD1, runtimeString } from "../../_lib/server";

function readInstance(payload: Record<string, unknown>) {
  if (typeof payload.instance === "string") return payload.instance;
  if (typeof payload.instanceName === "string") return payload.instanceName;
  const data = payload.data;
  if (data && typeof data === "object" && typeof (data as Record<string, unknown>).instanceName === "string") return (data as Record<string, unknown>).instanceName as string;
  return "";
}

export async function POST(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    const expected = runtimeString("EVOLUTION_WEBHOOK_SECRET");
    if (!expected || token !== expected) throw new ApiError(401, "Webhook não autorizado.");
    const payload = await request.json() as Record<string, unknown>;
    const instanceName = readInstance(payload);
    if (!instanceName) throw new ApiError(400, "Instância ausente.");
    const event = String(payload.event || payload.type || "unknown").toUpperCase().replaceAll(".", "_");
    const db = getD1();

    if (event.includes("CONNECTION_UPDATE")) {
      const data = payload.data && typeof payload.data === "object" ? payload.data as Record<string, unknown> : {};
      const status = String(data.state || data.status || payload.state || "connecting");
      const rawPhone = String(data.ownerJid || data.owner || payload.ownerJid || "").replace(/\D/g, "");
      await db.prepare("UPDATE whatsapp_bot_connections SET status = ?, phone = COALESCE(NULLIF(?, ''), phone), updated_at = CURRENT_TIMESTAMP WHERE instance_name = ?").bind(status, rawPhone, instanceName).run();
    }

    if (event.includes("MESSAGES_UPSERT")) {
      const n8nUrl = runtimeString("N8N_WEBHOOK_URL");
      const secret = runtimeString("N8N_SHARED_SECRET");
      if (n8nUrl && secret) {
        const connection = await db.prepare("SELECT instance_name AS instanceName FROM whatsapp_bot_connections WHERE instance_name = ?").bind(instanceName).first<{ instanceName: string }>();
        if (connection) {
          const forwarded = await fetch(n8nUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-granize-secret": secret },
            body: JSON.stringify({ source: "evolution", instanceName, payload }),
          });
          if (!forwarded.ok) throw new ApiError(502, "n8n não confirmou o recebimento da mensagem.");
        }
      }
    }
    return Response.json({ received: true });
  } catch (error) {
    return errorResponse(error);
  }
}
