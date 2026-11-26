import { createClient } from "@supabase/supabase-js";

export type ProfileObject = { body: Blob; httpMetadata: { contentType: string }; httpEtag: string };
export interface ProfileStorage {
  get(key: string): Promise<ProfileObject | null>;
  put(key: string, data: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<void>;
  delete(key: string): Promise<void>;
}

export function profileStorage(): ProfileStorage {
  function bucket() {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) throw new Error("Armazenamento de fotos ainda não configurado.");
    return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }).storage.from("granize-profile-images");
  }
  return {
    async get(key) {
      const { data, error } = await bucket().download(key);
      if (error || !data) return null;
      return { body: data, httpMetadata: { contentType: data.type || "image/jpeg" }, httpEtag: `"${key.split("/").pop()}"` };
    },
    async put(key, data, options) {
      const { error } = await bucket().upload(key, data, { contentType: options.httpMetadata.contentType, upsert: false });
      if (error) throw new Error("Não foi possível salvar a foto. Tente novamente.");
    },
    async delete(key) {
      const { error } = await bucket().remove([key]);
      if (error) throw new Error("Não foi possível remover a foto.");
    },
  };
}
