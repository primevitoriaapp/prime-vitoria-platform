import { z } from "zod";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { db } from "@/lib/server/db";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";
import { getClientInvoice, updateClientInvoiceStatus } from "@/lib/finance/client-invoices";
import { formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";
import { sendOperationalEmail } from "@/lib/notifications/send-email";
import { insertAuditEvent } from "@/lib/server/audit-log";
import { invoicePdfFor } from "@/lib/finance/invoice-pdf-data";

const BUCKET = "invoice-files";
const COPY_TO = "contato@primevitoria.com";
const brDate = (ymd: string) => ymd.split("-").reverse().join("/");
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function staff(role: string) {
  return role === "admin" || role === "financeiro";
}

async function defaults(tenantId: string, id: string, tipo: "fatura" | "lembrete" = "fatura") {
  const invoice = await getClientInvoice(tenantId, id);
  if (!invoice || invoice.status === "cancelada") return null;
  const inv = invoice as typeof invoice & { client_ref?: string | null; voucher_path?: string | null; boleto_path?: string | null; nf_path?: string | null };
  const { data: client } = await db.from("clients").select("name, trade_name, email").eq("id", invoice.client_id).maybeSingle();
  const to = new Set<string>();
  if (client?.email) to.add(String(client.email).trim().toLowerCase());
  const { data: gestores } = await db
    .from("profiles")
    .select("id")
    .eq("client_id", invoice.client_id)
    .eq("role", "cliente")
    .eq("client_access", "gestor")
    .eq("active", true);
  for (const g of gestores ?? []) {
    const { data } = await db.auth.admin.getUserById(g.id as string);
    if (data.user?.email) to.add(data.user.email.toLowerCase());
  }
  const num = formatInvoiceNumber(invoice.number);
  const name = (client?.trade_name as string | null) || (client?.name as string | null) || "Cliente";
  const ref = inv.client_ref ? ` · ${inv.client_ref}` : "";
  const periodo =
    invoice.period_start === invoice.period_end ? brDate(invoice.period_start) : `${brDate(invoice.period_start)} a ${brDate(invoice.period_end)}`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  const vencida = invoice.due_date < today;
  const reminder = [
    `Olá, equipe ${name}.`,
    "",
    vencida
      ? `Identificamos que a fatura ${num}${inv.client_ref ? ` (voucher ${inv.client_ref})` : ""}, no valor de ${brl(invoice.total_amount)}, venceu em ${brDate(invoice.due_date)} e ainda consta em aberto em nosso sistema.`
      : `Lembramos que a fatura ${num}${inv.client_ref ? ` (voucher ${inv.client_ref})` : ""}, no valor de ${brl(invoice.total_amount)}, vence em ${brDate(invoice.due_date)}.`,
    "",
    invoice.boleto_line ? `Linha digitável: ${invoice.boleto_line}` : "A fatura detalhada e o boleto seguem novamente em anexo.",
    "",
    vencida ? "Se o pagamento já foi feito, por favor desconsidere esta mensagem e, se possível, nos envie o comprovante." : "Se o pagamento já foi programado, por favor desconsidere esta mensagem.",
    "",
    "Atenciosamente,"
  ].join("\n");
  const message = tipo === "lembrete" ? reminder : [
    `Olá, equipe ${name}.`,
    "",
    inv.client_ref
      ? `Segue o fechamento do voucher ${inv.client_ref} (serviços de ${periodo}).`
      : `Segue o fechamento dos serviços de ${periodo}.`,
    "",
    `Fatura: ${num}`,
    `Serviços: ${invoice.trip_count}`,
    `Valor total: ${brl(invoice.total_amount)}`,
    `Vencimento: ${brDate(invoice.due_date)}`,
    invoice.boleto_line ? `Linha digitável: ${invoice.boleto_line}` : null,
    "",
    "Seguem em anexo a fatura detalhada (com todos os serviços) e o boleto. Qualquer dúvida, estamos à disposição.",
    "",
    "Atenciosamente,"
  ]
    .filter((l) => l !== null)
    .join("\n");
  return {
    invoice: inv,
    to: [...to],
    cc: [] as string[],
    subject:
      tipo === "lembrete"
        ? `${vencida ? "Fatura vencida" : "Lembrete de vencimento"}: ${num}${ref} — ${brDate(invoice.due_date)} — Prime Vitória`
        : `Fatura ${num}${ref} — ${name} — Prime Vitória`,
    message,
    files: { fatura: true, boleto: Boolean(inv.boleto_path), nf: Boolean(inv.nf_path), voucher: Boolean(inv.voucher_path) },
    link: `${OFFICIAL_URLS.empresa}/fatura/${invoice.id}`,
    copy_to: COPY_TO
  };
}

/** Rascunho do e-mail da fatura (para revisar antes de enviar). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Só admin ou financeiro enviam faturas", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const d = await defaults(tenantId, id, new URL(request.url).searchParams.get("tipo") === "lembrete" ? "lembrete" : "fatura");
    if (!d) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);
    return ok({ to: d.to, cc: d.cc, subject: d.subject, message: d.message, files: d.files, link: d.link, copy_to: d.copy_to });
  } catch (error) {
    return mapApiError(error);
  }
}

const emailList = z
  .array(z.string().trim().toLowerCase().email())
  .max(15)
  .default([]);
const bodySchema = z
  .object({
    to: emailList,
    cc: emailList,
    subject: z.string().trim().min(3).max(200).optional(),
    message: z.string().trim().max(5000).optional(),
    attach: z
      .object({ fatura: z.boolean().default(true), boleto: z.boolean().default(true), nf: z.boolean().default(true), voucher: z.boolean().default(true) })
      .partial()
      .optional(),
    copy_me: z.boolean().default(true),
    save_client_email: z.boolean().default(false),
    tipo: z.enum(["fatura", "lembrete"]).default("fatura")
  })
  .partial();

async function fileAttachment(path: string | null | undefined, filename: string) {
  if (!path) return null;
  const { data } = await db.storage.from(BUCKET).download(path);
  if (!data) return null;
  const ext = path.split(".").pop() || "pdf";
  const buf = Buffer.from(await data.arrayBuffer());
  return { filename: `${filename}.${ext}`, content: buf.toString("base64"), content_type: data.type || "application/pdf" };
}

/** Envia a fatura por e-mail: destinatários, assunto e texto editáveis; boleto, nota e voucher anexados. Cópia para a Prime. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!staff(session.role)) return fail("FORBIDDEN", "Só admin ou financeiro enviam faturas", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const raw = await request.text();
    const body = bodySchema.parse(raw ? JSON.parse(raw) : {});
    const d = await defaults(tenantId, id, body.tipo ?? "fatura");
    if (!d) return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);

    const to = body.to?.length ? body.to : d.to;
    if (!to.length) return fail("NO_RECIPIENT", "Informe para quem enviar (o cliente não tem e-mail no cadastro).", 400);
    const subject = body.subject || d.subject;
    const message = body.message || d.message;
    const inv = d.invoice;
    const num = formatInvoiceNumber(inv.number);
    const ref = inv.client_ref ? `-${inv.client_ref}` : "";
    const want = { fatura: true, boleto: true, nf: true, voucher: true, ...(body.attach ?? {}) };
    // Fatura detalhada em PDF: o cliente nem sempre tem acesso ao painel, então vai sempre anexa.
    const faturaPdf = want.fatura
      ? await invoicePdfFor(tenantId, id)
          .then((p) => (p ? { filename: p.filename, content: Buffer.from(p.bytes).toString("base64"), content_type: "application/pdf" } : null))
          .catch(() => null)
      : null;
    const attachments = (
      await Promise.all([
        faturaPdf,
        want.boleto ? fileAttachment(inv.boleto_path, `Boleto-${num}${ref}`) : null,
        want.nf ? fileAttachment(inv.nf_path, `NotaFiscal-${num}${ref}`) : null,
        want.voucher ? fileAttachment(inv.voucher_path, `Voucher${ref || `-${num}`}`) : null
      ])
    ).filter((a): a is NonNullable<typeof a> => Boolean(a));

    const signature = "Prime Vitória | Transporte Executivo\nCentral 24h: (27) 2142-8307 | (27) 99806-3956\ncontato@primevitoria.com";
    const text = `${message}\n\n${signature}`;
    const html = `<!doctype html><html><body style="margin:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="background:#0B0B0B;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;border-bottom:3px solid #C9A84C">
    <table style="border-collapse:collapse;width:100%"><tr>
      <td style="width:64px;padding-right:14px"><img src="${OFFICIAL_URLS.central}/api/public/brand-logo" width="56" height="56" alt="Prime Vitória" style="display:block;border-radius:10px;background:#fff"></td>
      <td><div style="font-size:19px;font-weight:bold;letter-spacing:.04em">PRIME <span style="color:#C9A84C">VITÓRIA</span></div>
      <div style="font-size:10.5px;letter-spacing:.14em;color:#C9A84C;margin-top:3px">TRANSPORTE EXECUTIVO · MOBILIDADE CORPORATIVA</div></td>
      <td style="text-align:right;font-size:11px;color:#bbb;white-space:nowrap">FATURA<br><b style="color:#C9A84C;font-size:15px">${num}</b></td>
    </tr></table>
  </div>
  <div style="background:#fff;padding:22px;border-radius:0 0 12px 12px;font-size:14px;line-height:1.6;color:#222">
    ${esc(message).replace(/\n/g, "<br>")}
    <p style="margin:18px 0 14px;font-size:13px;color:#555">📎 Em anexo: ${attachments.map((a) => esc(a.filename)).join(", ") || "—"}</p>
    <p style="margin:0;font-size:13px;border-top:1px solid #EFEAE0;padding-top:12px"><b>Prime Vitória</b> | Transporte Executivo<br>Central 24h: (27) 2142-8307 | (27) 99806-3956<br><a href="mailto:contato@primevitoria.com" style="color:#8A6D1F">contato@primevitoria.com</a></p>
  </div>
</div></body></html>`;

    const sent = await sendOperationalEmail({
      to,
      cc: body.cc ?? [],
      bcc: body.copy_me === false ? [] : [COPY_TO],
      subject,
      text,
      html,
      replyTo: COPY_TO,
      attachments
    });
    if (!sent.ok) return fail("EMAIL_FAILED", sent.skipped ? "E-mail não configurado na plataforma." : `O e-mail não saiu: ${sent.reason}`, 502);
    if (inv.status === "aberta") await updateClientInvoiceStatus(tenantId, id, { status: "enviada" });
    // Cliente sem e-mail no cadastro: guarda o primeiro destinatário para as próximas faturas.
    if (body.save_client_email && !d.to.length) await db.from("clients").update({ email: to[0] }).eq("id", inv.client_id).is("email", null);
    await insertAuditEvent({
      tenantId,
      actorUserId: session.userId,
      action: body.tipo === "lembrete" ? "invoice.reminder" : "invoice.send",
      entityType: "client_invoice",
      entityId: id,
      metadata: { to, cc: body.cc ?? [], subject, anexos: attachments.map((a) => a.filename) },
      request
    });
    return ok({ sent_to: to, attachments: attachments.map((a) => a.filename) });
  } catch (error) {
    return mapApiError(error);
  }
}
