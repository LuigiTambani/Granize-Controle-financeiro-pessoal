import { ApiError, errorResponse, normalizeEvolutionUrl, runtimeString } from "../../_lib/server";

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

function decodeBase64(value: string) {
  const clean = value.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
  const estimatedBytes = Math.floor(clean.length * 0.75);
  if (!clean || estimatedBytes > MAX_AUDIO_BYTES) throw new ApiError(413, "O áudio é muito grande. Envie um áudio de até 15 MB.");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export async function POST(request: Request) {
  try {
    const expected = runtimeString("N8N_SHARED_SECRET");
    if (!expected || request.headers.get("x-granize-secret") !== expected) throw new ApiError(401, "Integração não autorizada.");

    const payload = await request.json() as { instanceName?: string; message?: Record<string, unknown> };
    if (!payload.instanceName || !payload.message) throw new ApiError(400, "Mensagem de áudio incompleta.");

    const evolutionUrl = normalizeEvolutionUrl(runtimeString("EVOLUTION_API_URL"));
    const evolutionKey = runtimeString("EVOLUTION_API_KEY");
    const whisperUrl = normalizeEvolutionUrl(runtimeString("WHISPER_API_URL"));
    if (!evolutionUrl || !evolutionKey || !whisperUrl) throw new ApiError(503, "Transcrição de áudio ainda não configurada.");

    const mediaResponse = await fetch(`${evolutionUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(payload.instanceName)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: evolutionKey },
      body: JSON.stringify({ message: payload.message }),
    });
    const media = await mediaResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!mediaResponse.ok) throw new ApiError(502, typeof media.message === "string" ? media.message : "Não foi possível baixar o áudio do WhatsApp.");

    const base64 = typeof media.base64 === "string" ? media.base64 : "";
    const mimeType = typeof media.mimetype === "string" && media.mimetype.startsWith("audio/") ? media.mimetype : "audio/ogg";
    const fileName = typeof media.fileName === "string" && media.fileName ? media.fileName : "audio-whatsapp.ogg";
    const bytes = decodeBase64(base64);
    const audioBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: mimeType }), fileName);
    form.append("language", "pt");
    form.append("model", runtimeString("WHISPER_MODEL") || "Systran/faster-whisper-small");
    form.append("response_format", "json");

    const transcriptionResponse = await fetch(`${whisperUrl}/v1/audio/transcriptions`, { method: "POST", body: form });
    const result = await transcriptionResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!transcriptionResponse.ok) throw new ApiError(502, typeof result.detail === "string" ? result.detail : "Não foi possível transcrever o áudio.");
    const text = typeof result.text === "string" ? result.text.trim() : "";
    if (!text) throw new ApiError(422, "Não consegui entender o áudio. Tente falar mais perto do microfone.");

    return Response.json({ text });
  } catch (error) {
    return errorResponse(error);
  }
}
