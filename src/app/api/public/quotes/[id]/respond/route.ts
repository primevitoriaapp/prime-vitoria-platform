import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { approveQuote } from "@/lib/quotes/approve-quote";
import { formatQuoteNumber } from "@/lib/quotes/quote-calc";
import { pushToStaff } from "@/lib/push/web-push";
import { enqueueInAppForTenantRoles } from "@/lib/notifications/enqueue-for-profiles";

const bodySchema = z.object({
  t: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
  action: z.enum(["aprovar", "ajuste"]),
  name: z.string().trim().min(2).max(120),
  message: z.string().trim().max(1500).optional()
});

/** O cliente responde pelo link do orçamento: aprova (corridas entram na agenda) ou pede ajuste. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const { data: q } = await db.from("quotes").select("id, tenant_id, number, status, valid_until, share_token, contact_name").eq("id", id).eq("share_token", body.t).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    if (q.status === "aprovado") return ok({ status: "aprovado", already: true });
    if (["recusado", "cancelado"].includes(q.status as string)) return fail("CLOSED", "Este orçamento foi encerrado. Fale com a Prime.", 409);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    if (q.valid_until && (q.valid_until as string) < today) return fail("EXPIRED", "Este orçamento venceu. Peça uma atualização à Prime.", 409);

    const tenantId = q.tenant_id as string;
    const number = formatQuoteNumber(q.number as number);
    const note = `${body.action === "aprovar" ? "Aprovado" : "Pedido de ajuste"} pelo cliente (${body.name}) em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}${body.message ? `: ${body.message}` : ""}`;
    await db.from("quotes").update({ client_response: note, client_responded_at: new Date().toISOString() }).eq("id", id);

    let result: { status: string; trips?: number; pending?: string } = { status: "ajuste" };
    if (body.action === "aprovar") {
      const r = await approveQuote(tenantId, id, null);
      // Se faltou dado (ex.: horário), a aprovação fica registrada e a central completa e confirma.
      result = r.ok ? { status: "aprovado", trips: r.trips } : { status: "aprovado_pendente", pending: r.message };
    }

    const title = body.action === "aprovar" ? `✅ ${number} aprovado pelo cliente` : `✏️ ${number}: cliente pediu ajuste`;
    const text = result.status === "aprovado_pendente" ? `${body.name} aprovou, mas falta completar: ${result.pending}` : `${body.name}${body.message ? `: ${body.message.slice(0, 120)}` : ""}`;
    await Promise.allSettled([
      pushToStaff(tenantId, { title, body: text, url: "/orcamentos", tag: `quote-${id}` }),
      enqueueInAppForTenantRoles(tenantId, ["admin", "operador"], { eventType: "operations.quote_response", quoteId: id, title, body: text }, { correlation_id: `quote-${id}-${Date.now()}` })
    ]);
    return ok(result);
  } catch (error) {
    return mapApiError(error);
  }
}
