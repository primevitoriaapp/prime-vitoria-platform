import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import type { FinanceEntityType, FinanceFileKind } from "@/lib/finance/finance-files";

/** Sobe um anexo (comprovante, boleto, nota) de um lançamento do financeiro. Lança erro com mensagem clara. */
export async function uploadFinanceFile(entityType: FinanceEntityType, entityId: string, kind: FinanceFileKind, file: File): Promise<void> {
  const u = await fetchWithSupabaseSession(
    "/api/finance/files/upload-url",
    { method: "POST", body: JSON.stringify({ entity_type: entityType, entity_id: entityId, file_name: file.name, size: file.size }) },
    "admin"
  );
  const uj = (await u.json().catch(() => ({}))) as { success?: boolean; data?: { path: string; url: string }; error?: { message?: string } };
  if (!u.ok || !uj.success || !uj.data) throw new Error(uj.error?.message ?? "Falha ao preparar o envio do arquivo");
  const put = await fetch(uj.data.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" } });
  if (!put.ok) throw new Error("O arquivo não subiu. Confira a internet.");
  const s = await fetchWithSupabaseSession(
    "/api/finance/files",
    { method: "POST", body: JSON.stringify({ entity_type: entityType, entity_id: entityId, kind, path: uj.data.path, file_name: file.name, size: file.size, content_type: file.type || null }) },
    "admin"
  );
  if (!s.ok) throw new Error("Falha ao salvar o anexo");
}
