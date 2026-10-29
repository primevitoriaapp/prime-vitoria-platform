import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { sendOperationalEmail } from "@/lib/notifications/send-email";
import { formatQuoteNumber, itemHours, quoteTotals, serviceLabelForClient } from "@/lib/quotes/quote-calc";
import { quoteShareLink } from "@/lib/quotes/quote-share";
import { getTenantCompanyProfile } from "@/lib/company/tenant-company-profile";

const bodySchema = z.object({
  to: z.string().trim().min(5).max(500),
  message: z.string().trim().max(4000).default("")
});

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const when = (iso: string | null, date: string | null) => {
  if (iso) return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  return date ? `${date.split("-").reverse().join("/")} (horário a combinar)` : "Data a combinar";
};

/** Envia o orçamento por e-mail (Resend) com resumo e link público para ver e imprimir. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const recipients = body.to.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
    if (!recipients.length || recipients.some((r) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r))) return fail("INVALID_EMAIL", "Confira o e-mail do cliente.", 400);

    const { data: q } = await db.from("quotes").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    const { data: items } = await db.from("quote_items").select("*").eq("quote_id", id).order("position");
    const catIds = [...new Set((items ?? []).map((i) => i.vehicle_category_id as string).filter(Boolean))];
    const { data: cats } = catIds.length ? await db.from("vehicle_categories").select("id, name").in("id", catIds) : { data: [] };
    const catName = new Map((cats ?? []).map((c) => [c.id as string, c.name as string]));
    const totals = quoteTotals((items ?? []).map((i) => ({ quantity: Number(i.quantity), unit_price: Number(i.unit_price) })), Number(q.discount) || 0);
    const link = await quoteShareLink(id, q.share_token as string | null);
    const number = formatQuoteNumber(q.number as number);
    const subject = `Orçamento ${number} · Prime Vitória Transporte Executivo`;

    const rows = (items ?? [])
      .map((i) => {
        const svc = serviceLabelForClient(i.service_mode as string, itemHours(i.service_mode as string, i.hours == null ? null : Number(i.hours)));
        const route = String(i.service_mode).startsWith("diaria")
          ? `À disposição · ${i.destination_text || i.origin_text || ""}`
          : `${i.origin_text ?? ""} → ${i.destination_text ?? ""}`;
        return `<tr>
          <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top">${esc(when(i.scheduled_at as string | null, i.service_date as string | null))}</td>
          <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:13px;vertical-align:top"><b>${esc(catName.get(i.vehicle_category_id as string) ?? "Veículo")}</b>${Number(i.quantity) > 1 ? ` × ${i.quantity}` : ""}<br><span style="color:#666">${esc([svc, route].filter(Boolean).join(" · "))}</span></td>
          <td style="padding:8px 6px;border-bottom:1px solid #eee;font-size:13px;text-align:right;white-space:nowrap;vertical-align:top">${brl(Number(i.unit_price) * Number(i.quantity))}</td>
        </tr>`;
      })
      .join("");

    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:620px;margin:0 auto;color:#111">
      <div style="background:#111;padding:18px 22px"><span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:.04em">PRIME <span style="color:#C9A84C">VITÓRIA</span></span><div style="font-size:10px;letter-spacing:.16em;color:#C9A84C">TRANSPORTE EXECUTIVO</div></div>
      <div style="height:4px;background:#C9A84C"></div>
      <div style="padding:20px 22px;font-size:14px;line-height:1.55;white-space:pre-line">${esc(body.message)}</div>
      <div style="padding:0 22px"><table style="width:100%;border-collapse:collapse">${rows}</table>
        <p style="text-align:right;font-size:16px;margin:12px 0"><b>Total: ${brl(totals.total)}</b></p>
        <p style="text-align:center;margin:22px 0"><a href="${link}" style="background:#C9A84C;color:#111;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700">Ver orçamento completo (${number})</a></p>
      </div>
      <p style="padding:0 22px 22px;font-size:12px;color:#777">Para aprovar, toque em “Ver orçamento completo” e depois em “Aprovar orçamento”. Prime Vitória · Transporte Executivo · Vitória/ES</p>
    </div>`;
    const text = `${body.message}\n\nOrçamento ${number} · Total ${brl(totals.total)}\nVer completo: ${link}`;

    const company = await getTenantCompanyProfile(tenantId).catch(() => null);
    const sent = await sendOperationalEmail({ to: recipients, subject, text, html, replyTo: company?.email || undefined });
    if (!sent.ok) {
      const domainIssue = /domain|verify|testing emails|own email/i.test(sent.reason);
      return ok({
        sent: false,
        link,
        subject,
        reason: sent.skipped
          ? "O envio automático de e-mail ainda não está ligado. Use o botão abaixo para mandar pelo seu e-mail."
          : domainIssue
            ? "O e-mail da Prime ainda não está verificado no serviço de envio, então só dá para mandar pelo seu e-mail por enquanto. Use o botão abaixo."
            : `O envio falhou (${sent.reason.slice(0, 120)}). Use o botão abaixo para mandar pelo seu e-mail.`
      });
    }

    const nowIso = new Date().toISOString();
    await db
      .from("quotes")
      .update({ sent_at: nowIso, sent_to: recipients.join(", "), updated_at: nowIso, ...(q.status === "rascunho" ? { status: "enviado" } : {}) })
      .eq("id", id);
    await insertAuditEvent({ tenantId, actorUserId: session.userId, action: "quote.email", entityType: "quote", entityId: id, metadata: { to: recipients }, request });
    return ok({ sent: true, link, subject });
  } catch (error) {
    return mapApiError(error);
  }
}
