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

export type ZapTemplate = { token: string; name: string };

/** Modelos (DOCX dinâmicos) da conta. */
export async function zapsignListTemplates(): Promise<ZapTemplate[]> {
  const raw = await call<unknown>("/templates/");
  const arr = Array.isArray(raw) ? raw : ((raw as { results?: unknown[] })?.results ?? []);
  return (arr as Record<string, unknown>[])
    .map((t) => ({ token: String(t.token ?? t.id ?? ""), name: String(t.name ?? "Modelo") }))
    .filter((t) => t.token);
}

/** Variáveis {{...}} do modelo (lidas do detalhe que a ZapSign devolve). */
export async function zapsignTemplateVariables(templateToken: string): Promise<{ name: string; variables: string[] }> {
  const raw = await call<Record<string, unknown>>(`/templates/${encodeURIComponent(templateToken)}/`);
  const found = new Set<string>();
  for (const m of JSON.stringify(raw).matchAll(/\{\{\s*[^{}"\\]+?\s*\}\}/g)) found.add(m[0].replace(/\s+/g, " ").trim());
  return { name: String(raw.name ?? "Modelo"), variables: [...found] };
}

export async function zapsignCreateFromTemplate(input: {
  templateId: string;
  signer: NewSigner;
  data: { de: string; para: string }[];
  externalId?: string;
}): Promise<ZapDoc> {
  const digits = String(input.signer.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return call<ZapDoc>("/models/create-doc/", {
    method: "POST",
    body: JSON.stringify({
      template_id: input.templateId,
      signer_name: input.signer.name,
      signer_email: input.signer.email || undefined,
      signer_phone_country: digits ? "55" : undefined,
      signer_phone_number: digits || undefined,
      lang: "pt-br",
      external_id: input.externalId,
      data: input.data
    })
  });
}

export async function zapsignAddSigner(docToken: string, s: NewSigner): Promise<ZapSigner> {
  const digits = String(s.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  return call<ZapSigner>(`/docs/${encodeURIComponent(docToken)}/add-signer/`, {
    method: "POST",
    body: JSON.stringify({
      name: s.name,
      email: s.email || undefined,
      phone_country: digits ? "55" : undefined,
      phone_number: digits || undefined,
      auth_mode: "assinaturaTela",
      send_automatic_email: Boolean(s.email),
      qualification: s.role || undefined
    })
  });
}
