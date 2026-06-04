import { db } from "@/lib/server/db";
import { isDriverPhotoStoragePath } from "@/lib/storage/driver-photo-path";

export { isDriverPhotoStoragePath } from "@/lib/storage/driver-photo-path";

const BUCKET = "driver-photos";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7;

export type UploadDriverPhotoInput = {
  tenantId: string;
  driverId: string;
  file: File;
};

export type UploadDriverPhotoResult = {
  storage_path: string;
  photo_url: string;
  display_url: string | null;
};

/** Gera URL assinada para exibir foto (path guardado em drivers.photo_url). */
export async function resolveDriverPhotoDisplayUrl(
  photoUrlOrPath: string | null | undefined
): Promise<string | null> {
  const raw = photoUrlOrPath?.trim();
  if (!raw) return null;
  if (!isDriverPhotoStoragePath(raw)) return raw;

  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(raw, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadDriverPhotoFile(input: UploadDriverPhotoInput): Promise<UploadDriverPhotoResult> {
  const { tenantId, driverId, file } = input;

  if (file.size > MAX_BYTES) {
    throw new Error("Imagem excede 5 MB.");
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.has(mime)) {
    throw new Error("Formato não permitido (JPEG, PNG ou WebP).");
  }

  const ext = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
  const path = `${tenantId}/${driverId}/${crypto.randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: true
  });

  if (error) {
    throw new Error(error.message);
  }

  const display_url = await resolveDriverPhotoDisplayUrl(path);

  return {
    storage_path: path,
    photo_url: path,
    display_url
  };
}
