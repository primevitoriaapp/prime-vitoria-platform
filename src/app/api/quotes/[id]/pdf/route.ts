import { z } from "zod";
import { db } from "@/lib/server/db";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { loadLogoBytes, loadQuoteDoc } from "@/lib/quotes/quote-document";
import { buildQuotePdf } from "@/lib/quotes/quote-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** PDF do orçamento (arquivo de verdade, funciona em qualquer celular ou computador). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return new Response("Orçamento não encontrado", { status: 404 });
  const url = new URL(request.url);
  const t = url.searchParams.get("t");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = null;
  if (t && /^[A-Za-z0-9_-]{16,80}$/.test(t)) {
    const { data } = await db.from("quotes").select("*").eq("id", id).eq("share_token", t).maybeSingle();
    q = data;
  }
  if (!q) {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return new Response("Entre com a conta da Prime para baixar o orçamento.", { status: 401 });
    const { data } = await db.from("quotes").select("*").eq("id", id).eq("tenant_id", session.tenantId ?? DEFAULT_TENANT_ID).maybeSingle();
    q = data;
  }
  if (!q) return new Response("Orçamento não encontrado", { status: 404 });
  const doc = await loadQuoteDoc(q);
  const bytes = buildQuotePdf(doc, await loadLogoBytes(doc.logoPath));
  const who = doc.client.name.normalize("NFD").replace(/[^\w ]/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "Cliente";
  const file = `Orcamento-${doc.number.replace(/\D/g, "")}-${who}.pdf`;
  const inline = url.searchParams.get("download") !== "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file}"`,
      "Cache-Control": "private, no-store"
    }
  });
}
