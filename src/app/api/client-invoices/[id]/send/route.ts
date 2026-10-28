import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { db } from "@/lib/server/db";
import { getClientInvoice, updateClientInvoiceStatus } from "@/lib/finance/client-invoices";
import { formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";
import { sendOperationalEmail } from "@/lib/notifications/send-email";

function publicBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_BASE_URL?.trim() || "https://prime-vitoria-web.vercel.app").replace(/\/$/, "");
}

const brDate = (ymd: string) => ymd.split("-").reverse().join("/");
const brl = (n: number) => Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Envia a fatura por e-mail para o cliente (e-mail do cadastro + gestores com acesso ao portal). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (session.role !== "admin" && session.role !== "financeiro") {
      return fail("FORBIDDEN", "Só admin ou financeiro enviam faturas", 403);
    }
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const invoice = await getClientInvoice(tenantId, id);
    if (!invoice || invoice.status === "cancelada") return fail("INVOICE_NOT_FOUND", "Fatura não encontrada", 404);

    const { data: client } = await db.from("clients").select("name, trade_name, email").eq("id", invoice.client_id).maybeSingle();
    const recipients = new Set<string>();
    if (client?.email) recipients.add(String(client.email).trim().toLowerCase());
    const { data: gestores } = await db
      .from("profiles")
      .select("id")
      .eq("client_id", invoice.client_id)
      .eq("role", "cliente")
      .eq("client_access", "gestor")
      .eq("active", true);
    for (const g of gestores ?? []) {
      const { data } = await db.auth.admin.getUserById(g.id as string);
      if (data.user?.email) recipients.add(data.user.email.toLowerCase());
    }
    if (recipients.size === 0) return fail("NO_RECIPIENT", "O cliente não tem e-mail cadastrado", 400);

    const num = formatInvoiceNumber(invoice.number);
    const link = `${publicBaseUrl()}/fatura/${invoice.id}`;
    const name = (client?.trade_name as string | null) || (client?.name as string | null) || "Cliente";
    const text = [
      `Olá, ${name}.`,
      `Segue a fatura ${num} da Prime Vitória, referente a ${brDate(invoice.period_start)} a ${brDate(invoice.period_end)}.`,
      `Corridas: ${invoice.trip_count} · Total: ${brl(invoice.total_amount)} · Vencimento: ${brDate(invoice.due_date)}.`,
      invoice.boleto_url ? `Boleto: ${invoice.boleto_url}` : null,
      invoice.boleto_line ? `Linha digitável: ${invoice.boleto_line}` : null,
      `Relatório completo e 2ª via: ${link}`,
      "",
      "Prime Vitória — Transporte Executivo"
    ]
      .filter((l) => l !== null)
      .join("\n");
    const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto">
<div style="background:#111;color:#fff;padding:16px 20px;border-radius:10px 10px 0 0"><b>PRIME <span style="color:#C9A84C">VITÓRIA</span></b><div style="font-size:11px;letter-spacing:.14em;color:#C9A84C">FATURA ${num}</div></div>
<div style="border:1px solid #E8E4DC;border-top:0;padding:20px;border-radius:0 0 10px 10px">
<p>Olá, ${name}.</p><p>Segue a fatura referente a <b>${brDate(invoice.period_start)} a ${brDate(invoice.period_end)}</b>.</p>
<table style="border-collapse:collapse;font-size:14px"><tr><td style="padding:4px 16px 4px 0;color:#666">Corridas</td><td>${invoice.trip_count}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#666">Total</td><td><b>${brl(invoice.total_amount)}</b></td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#666">Vencimento</td><td>${brDate(invoice.due_date)}</td></tr></table>
${invoice.boleto_url ? `<p><a href="${invoice.boleto_url}" style="background:#111;color:#C9A84C;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir boleto</a></p>` : ""}
${invoice.boleto_line ? `<p style="font-family:monospace;font-size:13px">${invoice.boleto_line}</p>` : ""}
<p><a href="${link}" style="color:#B8943E">Ver relatório completo e 2ª via no portal</a></p></div></div>`;

    const sent = await sendOperationalEmail({ to: [...recipients], subject: `Fatura ${num} — Prime Vitória`, text, html });
    if (!sent.ok) {
      return fail(
        "EMAIL_FAILED",
        sent.skipped
          ? "E-mail não configurado na plataforma"
          : "O e-mail não saiu. Enquanto o domínio primevitoria.com não for verificado, só chegam e-mails para a sua própria caixa.",
        502
      );
    }
    if (invoice.status === "aberta") await updateClientInvoiceStatus(tenantId, id, { status: "enviada" });
    return ok({ sent_to: [...recipients] });
  } catch (error) {
    return mapApiError(error);
  }
}
