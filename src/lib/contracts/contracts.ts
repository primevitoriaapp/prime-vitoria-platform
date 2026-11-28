import { db } from "@/lib/server/db";
import { mapZapStatus, zapsignGetDoc, type ZapSigner } from "@/lib/integrations/zapsign";

export type ContractRow = {
  id: string;
  tenant_id: string;
  driver_id: string | null;
  client_id: string | null;
  title: string;
  status: "pendente" | "assinado" | "recusado" | "cancelado";
  file_path: string | null;
  zapsign_token: string | null;
  sign_url: string | null;
  signers: ZapSigner[];
  signed_file_url: string | null;
  notes: string | null;
  created_at: string;
  signed_at: string | null;
  synced_at: string | null;
};

/** O signatário "motorista" do contrato (marcado como Motorista, ou o primeiro da lista) já assinou? */
export function driverSigned(signers: (ZapSigner & { role?: string })[] | null | undefined): boolean {
  const list = signers ?? [];
  const d = list.find((x) => /motorista/i.test(String(x.role ?? ""))) ?? list[0];
  return Boolean(d && (d.status === "signed" || d.signed_at));
}

/** Atualiza a situação dos pendentes na ZapSign (no máximo a cada 2 min por contrato). */
export async function syncPending(rows: ContractRow[]): Promise<ContractRow[]> {
  const out: ContractRow[] = [];
  for (const r of rows) {
    const fresh = r.synced_at && Date.now() - Date.parse(r.synced_at) < 120_000;
    if (r.status !== "pendente" || !r.zapsign_token || fresh) {
      out.push(r);
      continue;
    }
    try {
      const doc = await zapsignGetDoc(r.zapsign_token);
      const status = mapZapStatus(doc.status);
      const before = (r.signers ?? []) as (ZapSigner & { role?: string })[];
      const roleOf = (name: string, i: number) => before.find((b) => b.name === name)?.role ?? before[i]?.role;
      const signers = (doc.signers ?? []).map((s, i) => ({ name: s.name, email: s.email ?? null, status: s.status, sign_url: s.sign_url ?? null, signed_at: s.signed_at ?? null, role: roleOf(s.name, i) }));
      // O motorista assinou a parte dele agora? Libera as corridas e avisa a central.
      if (r.driver_id && !driverSigned(before) && driverSigned(signers)) {
        await import("@/lib/drivers/contract-signed")
          .then(({ onDriverSignedContract }) => onDriverSignedContract(r.tenant_id, r.driver_id!, r.title))
          .catch(() => undefined);
      }
      const patch = {
        status,
        signers,
        synced_at: new Date().toISOString(),
        signed_at: status === "assinado" ? new Date().toISOString() : null
      };
      await db.from("contracts").update(patch).eq("id", r.id);
      out.push({ ...r, ...patch });
    } catch {
      out.push(r);
    }
  }
  return out;
}

/** Link novo do PDF (assinado na ZapSign, ou o original guardado aqui). */
export async function contractFileUrl(r: ContractRow, which: "assinado" | "original"): Promise<string | null> {
  if (which === "assinado" && r.zapsign_token) {
    try {
      const doc = await zapsignGetDoc(r.zapsign_token);
      if (doc.signed_file) return doc.signed_file;
    } catch {
      /* cai para o original */
    }
  }
  if (r.file_path) {
    const { data } = await db.storage.from("contracts").createSignedUrl(r.file_path, 600);
    if (data?.signedUrl) return data.signedUrl;
  }
  if (r.zapsign_token) {
    try {
      const doc = await zapsignGetDoc(r.zapsign_token);
      return doc.signed_file ?? doc.original_file ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

/** O link de assinatura de quem é o "dono" do contrato (motorista ou cliente), não o da Prime. */
export function partySignUrl(signers: ZapSigner[], partyName: string | null): string | null {
  const first = (n: string) => n.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const p = partyName ? first(partyName) : "";
  const pending = signers.filter((s) => s.status !== "signed" && s.sign_url);
  return (pending.find((s) => p && first(s.name) === p) ?? pending.find((s) => s.role === "parte") ?? pending[0])?.sign_url ?? null;
}
