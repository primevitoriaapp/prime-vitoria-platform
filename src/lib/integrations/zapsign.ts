import { db } from "@/lib/server/db";

const API = "https://api.zapsign.com.br/api/v1";

export type ZapSigner = { token?: string; name: string; email?: string | null; status?: string; sign_url?: string | null; signed_at?: string | null; role?: string };
export type ZapDoc = { token: string; status: string; name: string; signed_file: string | null; original_file: string | null; signers: ZapSigner[] };

export async function zapsignToken(): Promise<string | null> {
  const { data } = await db.from("app_secrets").select("value").eq("key", "zapsign").maybeSingle();
  const t = String((data?.value as { token?: string } | null)?.token ?? "").trim();
  return t.length > 10 ? t : null;
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await zapsignToken();
  if (!token) throw new Error("ZapSign não conectada. Cole o token em Integrações.");
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) }
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ZapSign recusou (${res.status}): ${text.slice(0, 200)}`);
  return JSON.parse(text) as T;
}

export type NewSigner = { name: string; email?: string | null; phone?: string | null; role?: string };

export async function zapsignCreateDoc(input: { name: string; base64Pdf: string; signers: NewSigner[]; externalId?: string }): Promise<ZapDoc> {
  return call<ZapDoc>("/docs/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name.slice(0, 250),
      base64_pdf: input.base64Pdf,
      lang: "pt-br",
      external_id: input.externalId,
      signers: input.signers.map((s) => {
        const digits = String(s.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
        return {
          name: s.name,
          email: s.email || undefined,
          phone_country: digits ? "55" : undefined,
          phone_number: digits || undefined,
          auth_mode: "assinaturaTela",
          send_automatic_email: Boolean(s.email),
          send_automatic_whatsapp: false,
          qualification: s.role || undefined
        };
      })
    })
  });
}

export async function zapsignGetDoc(docToken: string): Promise<ZapDoc> {
  return call<ZapDoc>(`/docs/${encodeURIComponent(docToken)}/`);
}

/** "pending" | "signed" | "refused" → nossa situação. */
export function mapZapStatus(s: string | null | undefined): "pendente" | "assinado" | "recusado" {
  const v = String(s ?? "").toLowerCase();
  if (v === "signed") return "assinado";
  if (v === "refused") return "recusado";
  return "pendente";
}

/** Token do documento a partir do link da ZapSign (app.zapsign.com.br/verificar/<token> ou /doc/<token>). */
export function zapTokenFromLink(link: string): string | null {
  const m = String(link).match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  return m ? m[0] : null;
}
