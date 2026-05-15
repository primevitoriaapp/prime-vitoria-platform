import { db } from "@/lib/server/db";

const BUCKET = "payment-proofs";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export type UploadPaymentProofInput = {
  tenantId: string;
  payableId: string;
  file: File;
};

export async function uploadPaymentProofFile(input: UploadPaymentProofInput): Promise<{
  storage_path: string;
  public_url: string;
}> {
  const { tenantId, payableId, file } = input;

  if (file.size > MAX_BYTES) {
    throw new Error("Ficheiro excede 5 MB.");
  }
  const mime = file.type || "application/octet-stream";
  if (!ALLOWED.has(mime)) {
    throw new Error("Tipo de ficheiro não permitido (JPEG, PNG, WebP ou PDF).");
  }

  const ext =
    mime === "image/jpeg"
      ? "jpg"
      : mime === "image/png"
        ? "png"
        : mime === "image/webp"
          ? "webp"
          : "pdf";
  const path = `${tenantId}/${payableId}/${crypto.randomUUID()}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false
  });

  if (error) {
    throw new Error(error.message);
  }

  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  const public_url = signed?.signedUrl ?? path;

  return { storage_path: path, public_url };
}
