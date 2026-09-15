import { ApiError, errorResponse, getD1, getProfileImages, requireApiUser } from "../../_lib/server";

const acceptedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    const row = await getD1().prepare("SELECT avatar_key AS avatarKey FROM users WHERE id = ?").bind(user.id).first<{ avatarKey: string | null }>();
    if (!row?.avatarKey) throw new ApiError(404, "Foto não encontrada.");
    const object = await getProfileImages().get(row.avatarKey);
    if (!object) throw new ApiError(404, "Foto não encontrada.");
    return new Response(object.body, {
      headers: {
        "Content-Type": object.httpMetadata?.contentType || "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        ETag: object.httpEtag,
      },
    });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  try {
    const user = await requireApiUser(request);
    const form = await request.formData();
    const photo = form.get("photo");
    if (!(photo instanceof File)) throw new ApiError(400, "Selecione uma foto.");
    const extension = acceptedTypes.get(photo.type);
    if (!extension) throw new ApiError(400, "Use uma imagem JPG, PNG ou WebP.");
    if (photo.size > 2 * 1024 * 1024) throw new ApiError(400, "A foto deve ter no máximo 2 MB.");
    const db = getD1();
    const previous = await db.prepare("SELECT avatar_key AS avatarKey FROM users WHERE id = ?").bind(user.id).first<{ avatarKey: string | null }>();
    const key = `profiles/${user.id}/${crypto.randomUUID()}.${extension}`;
    const bucket = getProfileImages();
    await bucket.put(key, await photo.arrayBuffer(), { httpMetadata: { contentType: photo.type } });
    await db.prepare("UPDATE users SET avatar_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(key, user.id).run();
    if (previous?.avatarKey) await bucket.delete(previous.avatarKey).catch(() => undefined);
    return Response.json({ ok: true, avatarVersion: key });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireApiUser(request);
    const db = getD1();
    const row = await db.prepare("SELECT avatar_key AS avatarKey FROM users WHERE id = ?").bind(user.id).first<{ avatarKey: string | null }>();
    await db.prepare("UPDATE users SET avatar_key = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?").bind(user.id).run();
    if (row?.avatarKey) await getProfileImages().delete(row.avatarKey).catch(() => undefined);
    return Response.json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
