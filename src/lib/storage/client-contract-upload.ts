import { db } from "@/lib/server/db";
import { isClientContractStoragePath } from "@/lib/storage/client-contract-path";

export { isClientContractStoragePath } from "@/lib/storage/client-contract-path";

const BUCKET = "client-contracts";
const MAX_BYTES = 10 * 1024 * 1024;
const SIGNED_URL_TTL_SEC = 60 * 60;

export type UploadClientContractInput = {
  tenantId: string;
  clientId: string;
  file: File;
};

export async function resolveClientContractSignedUrl(
  storagePath: string | null | undefined
): Promise<string | null> {
  const raw = storagePath?.trim();
  if (!raw || !isClientContractStoragePath(raw)) return null;
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(raw, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadClientContractFile(
  input: UploadClientContractInput
): Promise<{ storage_path: string }> {
  const { tenantId, clientId, file } = input;
  if (file.size > MAX_BYTES) {
    throw new Error("PDF excede 10 MB.");
  }
  const mime = file.type || "application/octet-stream";
  if (mime !== "application/pdf") {
    throw new Error("Envie um ficheiro PDF.");
  }

  const path = `${tenantId}/${clientId}/${crypto.randomUUID()}.pdf`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: "application/pdf",
    upsert: true
  });
  if (error) throw new Error(error.message);
  return { storage_path: path };
}
