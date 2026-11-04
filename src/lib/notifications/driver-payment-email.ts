import { db } from "@/lib/server/db";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";
import { sendOperationalEmail } from "@/lib/notifications/send-email";
import { isPlaceholderDriverEmail } from "@/lib/notifications/driver-assignment-email";

const CENTRAL_PHONES = "(27) 2142-8307 | (27) 99806-3956";
const METHOD: Record<string, string> = { pix: "PIX", ted: "TED / transferência", dinheiro: "Dinheiro" };

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const shortPlace = (t: string | null) => String(t ?? "—").split(",")[0].trim().slice(0, 60);

export type PaymentProofAttachment = { filename: string; base64: string; contentType: string } | null;

/**
 * Avisa cada motorista que o pagamento das corridas foi feito, com a lista discriminada
 * (O.S., data, trajeto, valor), o total e o comprovante anexado. Nunca mostra o nome do cliente.
 */
export async function emailDriverPayment(input: {
  tenantId: string;
  payableIds: string[];
  paidOn: string; // YYYY-MM-DD
  method: string;
  batch: string;
  proof: PaymentProofAttachment;
}): Promise<{ sent: number; skipped: string[] }> {
  const { data: pays } = await db
    .from("driver_payables")
    .select("id, trip_id, driver_id, amount")
    .eq("tenant_id", input.tenantId)
    .in("id", input.payableIds);
  const list = pays ?? [];
  const tripIds = [...new Set(list.map((p) => p.trip_id as string).filter(Boolean))];
  const driverIds = [...new Set(list.map((p) => p.driver_id as string).filter(Boolean))];
  const [{ data: trips }, { data: drivers }] = await Promise.all([
    tripIds.length
      ? db.from("trips").select("id, scheduled_at, origin_text, destination_text").in("id", tripIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    driverIds.length
      ? db.from("drivers").select("id, full_name, email").in("id", driverIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] })
  ]);
  const tripById = new Map((trips ?? []).map((t) => [t.id as string, t]));
  const paidOnBr = new Date(`${input.paidOn}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const methodLabel = METHOD[input.method] ?? input.method;
  const skipped: string[] = [];
  let sent = 0;

  for (const d of drivers ?? []) {
    const name = String(d.full_name ?? "").trim() || "motorista";
    const email = String(d.email ?? "").trim().toLowerCase();
    if (isPlaceholderDriverEmail(email)) {
      skipped.push(name);
      continue;
    }
    const mine = list
      .filter((p) => p.driver_id === d.id)
      .map((p) => {
        const t = tripById.get(p.trip_id as string);
        return {
          os: String(p.trip_id ?? p.id).slice(0, 8).toUpperCase(),
          at: (t?.scheduled_at as string | undefined) ?? null,
          route: `${shortPlace(t?.origin_text as string | null)} → ${shortPlace(t?.destination_text as string | null)}`,
          amount: Number(p.amount)
        };
      })
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    if (!mine.length) continue;
    const total = Math.round(mine.reduce((s, r) => s + r.amount, 0) * 100) / 100;
    const when = (iso: string | null) =>
      iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

    const td = 'style="padding:8px 8px 8px 0;border-bottom:1px solid #EFEAE0;font-size:13px;color:#111;vertical-align:top"';
    const th = 'style="padding:6px 8px 6px 0;border-bottom:2px solid #C9A84C;font-size:11px;color:#7A6A3A;text-align:left;text-transform:uppercase;letter-spacing:.05em"';
    const rowsHtml = mine
      .map(
        (r) =>
          `<tr><td ${td}><b>${r.os}</b></td><td ${td}>${esc(when(r.at))}</td><td ${td}>${esc(r.route)}</td><td ${td.replace("vertical-align:top", "vertical-align:top;text-align:right;white-space:nowrap")}>${brl(r.amount)}</td></tr>`
      )
      .join("");
    const P = 'style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#222"';

    const html = `<!doctype html><html><body style="margin:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:600px;margin:0 auto;padding:24px 16px">
  <div style="background:#0B0B0B;color:#fff;padding:18px 20px;border-radius:12px 12px 0 0;border-bottom:3px solid #C9A84C">
    <table style="border-collapse:collapse;width:100%"><tr>
      <td style="width:64px;padding-right:14px"><img src="${OFFICIAL_URLS.central}/api/public/brand-logo" width="60" height="60" alt="Prime Vitória" style="display:block;border-radius:10px;background:#fff"></td>
      <td><div style="font-size:19px;font-weight:bold;letter-spacing:.04em">PRIME <span style="color:#C9A84C">VITÓRIA</span></div>
      <div style="font-size:10.5px;letter-spacing:.14em;color:#C9A84C;margin-top:3px">TRANSPORTE EXECUTIVO · MOBILIDADE CORPORATIVA</div></td>
      <td style="text-align:right;font-size:11px;color:#bbb;white-space:nowrap">PAGAMENTO REALIZADO<br><b style="color:#C9A84C;font-size:15px">${brl(total)}</b></td>
    </tr></table>
  </div>
  <div style="background:#fff;padding:22px 22px 18px;border-radius:0 0 12px 12px">
    <p ${P}>Olá, ${esc(name)}.</p>
    <p ${P}>Você acaba de receber da Prime Vitória o pagamento ${mine.length > 1 ? `das ${mine.length} corridas abaixo` : "da corrida abaixo"}.${input.proof ? " O comprovante segue anexo." : ""}</p>
    <table style="border-collapse:collapse;width:100%;margin:4px 0 6px">
      <tr><th ${th}>O.S.</th><th ${th}>Data</th><th ${th}>Trajeto</th><th ${th.replace("text-align:left", "text-align:right")}>Valor</th></tr>
      ${rowsHtml}
      <tr><td colspan="3" style="padding:10px 8px 0 0;font-size:14px;font-weight:bold;color:#111">Total pago</td><td style="padding:10px 0 0;text-align:right;font-size:15px;font-weight:bold;color:#111;white-space:nowrap">${brl(total)}</td></tr>
    </table>
    <p style="margin:12px 0 16px;font-size:13px;color:#555">Pago em ${paidOnBr} · ${esc(methodLabel)} · Ref. ${esc(input.batch)}</p>
    <p ${P}>Caso identifique alguma divergência, por favor, acione a nossa Central de Atendimento informando o número da O.S.</p>
    <p ${P}>Obrigado por atender pela Prime Vitória.</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#222;border-top:1px solid #EFEAE0;padding-top:12px">
      <b>Prime Vitória</b> | Transporte Executivo<br>
      Central 24h: ${CENTRAL_PHONES}<br>
      <a href="mailto:contato@primevitoria.com" style="color:#8A6D1F">contato@primevitoria.com</a>
    </p>
  </div>
</div></body></html>`;

    const text = [
      `Olá, ${name}.`,
      "",
      `Você acaba de receber da Prime Vitória o pagamento ${mine.length > 1 ? `das ${mine.length} corridas abaixo` : "da corrida abaixo"}.${input.proof ? " O comprovante segue anexo." : ""}`,
      "",
      ...mine.map((r) => `OS ${r.os} · ${when(r.at)} · ${r.route} — ${brl(r.amount)}`),
      "",
      `Total pago: ${brl(total)}`,
      `Pago em ${paidOnBr} · ${methodLabel} · Ref. ${input.batch}`,
      "",
      "Caso identifique alguma divergência, por favor, acione a nossa Central de Atendimento informando o número da O.S.",
      "",
      "Obrigado por atender pela Prime Vitória.",
      "Prime Vitória | Transporte Executivo",
      `Central 24h: ${CENTRAL_PHONES}`,
      "contato@primevitoria.com"
    ].join("\n");

    const res = await sendOperationalEmail({
      to: email,
      subject: `Pagamento realizado | ${mine.length} corrida${mine.length > 1 ? "s" : ""} | ${brl(total)} | ${paidOnBr}`,
      text,
      html,
      attachments: input.proof ? [{ filename: input.proof.filename, content: input.proof.base64, content_type: input.proof.contentType }] : undefined
    });
    if (res.ok) sent++;
    else skipped.push(name);
  }
  return { sent, skipped };
}
