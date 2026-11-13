import { formatBrDateTime } from "@/lib/dates/br-date";
import { primeServiceTypeLabel } from "@/lib/pricing/prime-service-types";
import { sendOperationalEmail, resolveEmailFrom } from "@/lib/notifications/send-email";
import { resolveAppBaseUrl } from "@/lib/server/app-base-url";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";

/** Destinatário das notificações de solicitação do portal (operador). */
export const PORTAL_OPS_INBOX_PRODUCTION = "contato@primevitoria.com";

/** Sandbox Resend (onboarding@resend.dev): só entrega para o e-mail da conta. */
export const PORTAL_OPS_INBOX_RESEND_SANDBOX = "contatoprimevix@gmail.com";

export function resolvePortalOpsInbox(): string {
  const override = process.env.PORTAL_OPS_INBOX?.trim();
  if (override) return override;
  if (resolveEmailFrom().includes("@primevitoria.com")) {
    return PORTAL_OPS_INBOX_PRODUCTION;
  }
  return PORTAL_OPS_INBOX_RESEND_SANDBOX;
}

export type PortalTripRequestEmailInput = {
  clientName: string;
  serviceType: string;
  scheduledAt: string;
  originText: string;
  destinationText: string;
  tripId: string;
};

type Row = Record<string, unknown>;

const TZ = "America/Sao_Paulo";
const money = (v: unknown) =>
  v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function stopsOf(v: unknown): { address: string; name: string | null; phone: string | null }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => x as Row)
    .map((x) => ({
      address: String(x.address_text ?? x.address ?? x.label ?? "").trim(),
      name: (x.passenger_name as string | null) ?? (x.name as string | null) ?? null,
      phone: (x.passenger_phone as string | null) ?? (x.phone as string | null) ?? null
    }))
    .filter((x) => x.address || x.name);
}

/** Carrega tudo da corrida para o e-mail da central (melhor esforço: se falhar, usa o básico). */
async function loadTripDetail(tripId: string): Promise<{ trip: Row | null; requester: Row | null; category: string | null; costCenter: string | null; clientTrips30d: number | null }> {
  try {
    const { db } = await import("@/lib/server/db");
    const { data: trip } = await db.from("trips").select("*").eq("id", tripId).maybeSingle();
    if (!trip) return { trip: null, requester: null, category: null, costCenter: null, clientTrips30d: null };
    const t = trip as Row;
    const [req, cat, cc, cnt] = await Promise.all([
      t.requester_id || t.created_by
        ? db.from("profiles").select("id, name").eq("id", String(t.requester_id ?? t.created_by)).maybeSingle()
        : Promise.resolve({ data: null }),
      t.vehicle_category_id ? db.from("vehicle_categories").select("name").eq("id", String(t.vehicle_category_id)).maybeSingle() : Promise.resolve({ data: null }),
      t.cost_center_id ? db.from("cost_centers").select("name").eq("id", String(t.cost_center_id)).maybeSingle() : Promise.resolve({ data: null }),
      db.from("trips").select("id", { count: "exact", head: true }).eq("client_id", String(t.client_id)).gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString())
    ]);
    let requester = (req.data as Row | null) ?? null;
    if (requester?.id) {
      const { data: u } = await db.auth.admin.getUserById(String(requester.id));
      requester = { ...requester, email: u?.user?.email ?? null };
    }
    return {
      trip: t,
      requester,
      category: ((cat.data as Row | null)?.name as string | undefined) ?? null,
      costCenter: ((cc.data as Row | null)?.name as string | undefined) ?? null,
      clientTrips30d: typeof cnt.count === "number" ? cnt.count : null
    };
  } catch {
    return { trip: null, requester: null, category: null, costCenter: null, clientTrips30d: null };
  }
}

export async function notifyPortalTripRequestedEmail(
  input: PortalTripRequestEmailInput
): Promise<{ sent: boolean; reason?: string }> {
  const d = await loadTripDetail(input.tripId);
  const t = d.trip ?? {};
  const scheduledAt = String(t.scheduled_at ?? input.scheduledAt);
  const serviceLabel = primeServiceTypeLabel(String(t.service_type ?? input.serviceType), {
    audience: "operator",
    scheduledAt
  });
  const when = formatBrDateTime(scheduledAt) || scheduledAt;
  const sched = new Date(scheduledAt);
  const now = new Date();
  const dayKey = (x: Date) => x.toLocaleDateString("pt-BR", { timeZone: TZ });
  const dayWord =
    dayKey(sched) === dayKey(now) ? "HOJE" : dayKey(sched) === dayKey(new Date(now.getTime() + 86400000)) ? "AMANHÃ" : sched.toLocaleDateString("pt-BR", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit" });
  const hour = sched.toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const leadMin = Math.round((sched.getTime() - now.getTime()) / 60000);
  const leadText = leadMin < 60 ? `${Math.max(0, leadMin)} min` : leadMin < 48 * 60 ? `${Math.floor(leadMin / 60)}h${String(leadMin % 60).padStart(2, "0")}` : `${Math.round(leadMin / 1440)} dias`;
  const urgent = leadMin < 40;
  const soon = !urgent && leadMin < 180;

  const originFull = String(t.origin_text ?? input.originText);
  const destFull = String(t.destination_text ?? input.destinationText);
  const passenger = String(t.passenger_name ?? "").trim() || "A definir";
  const paxPhone = String(t.passenger_phone ?? "").trim();
  const paxCount = Number(t.passenger_count ?? 1) || 1;
  const pickups = stopsOf(t.trip_pickup_stops);
  const drops = stopsOf(t.trip_dropoff_stops);
  const notes = String(t.notes ?? "").trim();
  const flight = String(t.flight_number ?? "").trim();
  const estimate = money(t.client_amount);
  const km = t.planned_km != null && Number(t.planned_km) > 0 ? `${Number(t.planned_km).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km` : null;
  const vehicle = [d.category, serviceLabel].filter(Boolean).join(" · ");
  const reqName = String(d.requester?.name ?? "").trim();
  const reqEmail = String(d.requester?.email ?? "").trim();
  const base = OFFICIAL_URLS.central || resolveAppBaseUrl();
  const agendaUrl = `${base}/agenda?trip=${input.tripId}`;
  const mapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originFull)}&destination=${encodeURIComponent(destFull)}`;

  const subject = `${urgent ? "⚠ EM CIMA DA HORA · " : ""}Novo pedido · ${input.clientName} · ${dayWord === "HOJE" || dayWord === "AMANHÃ" ? dayWord : dayKey(sched)} ${hour} · ${passenger}`;

  const rows: [string, string][] = [
    ["Empresa", input.clientName],
    ["Pedido por", [reqName, reqEmail].filter(Boolean).join(" · ") || "Portal do cliente"],
    ["Passageiro", `${passenger}${paxCount > 1 ? ` (+${paxCount - 1}) — ${paxCount} pessoas` : ""}`],
    ...(paxPhone ? ([["Telefone", paxPhone]] as [string, string][]) : []),
    ["Veículo / serviço", vehicle || serviceLabel],
    ...(d.costCenter ? ([["Centro de custo", d.costCenter]] as [string, string][]) : []),
    ...(flight ? ([["Voo", flight]] as [string, string][]) : []),
    ...(km ? ([["Distância prevista", km]] as [string, string][]) : []),
    ...(estimate ? ([["Valor estimado (cliente)", estimate]] as [string, string][]) : [])
  ];

  const text = [
    urgent ? `⚠ PEDIDO EM CIMA DA HORA — embarque em ${leadText}.` : "Novo pedido de corrida pelo portal do cliente.",
    "",
    `QUANDO: ${dayWord} às ${hour} (${when}) — faltam ${leadText}`,
    `EMBARQUE: ${originFull}`,
    ...pickups.map((p, i) => `  Busca ${i + 1}: ${p.address}${p.name ? ` — ${p.name}` : ""}${p.phone ? ` (${p.phone})` : ""}`),
    ...drops.map((p, i) => `  Parada ${i + 1}: ${p.address}${p.name ? ` — ${p.name}` : ""}${p.phone ? ` (${p.phone})` : ""}`),
    `DESTINO: ${destFull}`,
    "",
    ...rows.map(([k, v]) => `${k}: ${v}`),
    ...(notes ? ["", `Observações: ${notes}`] : []),
    "",
    `Aprovar e escolher o motorista: ${agendaUrl}`,
    `Ver rota no mapa: ${mapsUrl}`,
    "",
    `ID: ${input.tripId}${d.clientTrips30d ? ` · ${d.clientTrips30d} pedido(s) desta empresa nos últimos 30 dias` : ""}`
  ].join("\n");

  const e = escapeHtml;
  const stopLine = (label: string, p: { address: string; name: string | null; phone: string | null }) =>
    `<tr><td style="padding:4px 0;vertical-align:top;width:18px"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#C9A84C;margin-top:5px"></span></td><td style="padding:4px 0;font-size:14px"><b>${e(label)}:</b> ${e(p.address)}${p.name ? ` — <b>${e(p.name)}</b>` : ""}${p.phone ? ` · ${e(p.phone)}` : ""}</td></tr>`;
  const banner = urgent
    ? `<tr><td style="background:#C0262D;color:#fff;padding:12px 24px;font-size:15px;font-weight:bold">⚠ EM CIMA DA HORA — embarque em ${e(leadText)}. Defina o motorista agora.</td></tr>`
    : soon
      ? `<tr><td style="background:#FFF3D6;color:#7A5200;padding:10px 24px;font-size:14px;font-weight:bold">Embarque em ${e(leadText)} — atenção ao prazo.</td></tr>`
      : "";

  const html = `<!doctype html><html><body style="margin:0;background:#F4F1EA;font-family:Arial,Helvetica,sans-serif;color:#111">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA;padding:20px 10px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:12px;overflow:hidden">
<tr><td style="background:#111;padding:16px 24px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><img src="${e(base)}/api/public/brand-logo" alt="Prime Vitória" height="44" style="display:block;border-radius:6px"></td>
    <td align="right" style="color:#C9A84C;font-size:11px;letter-spacing:2px">NOVO PEDIDO<br>PORTAL DO CLIENTE</td>
  </tr></table>
</td></tr>
<tr><td style="height:4px;background:#C9A84C"></td></tr>
${banner}
<tr><td style="padding:22px 24px 6px">
  <p style="margin:0;font-size:12px;color:#7A6A3A;letter-spacing:1px;text-transform:uppercase">${e(input.clientName)}</p>
  <p style="margin:6px 0 0;font-size:34px;font-weight:bold;line-height:1">${e(dayWord)} · ${e(hour)}</p>
  <p style="margin:6px 0 0;font-size:14px;color:#555">${e(when)} · faltam <b>${e(leadText)}</b></p>
</td></tr>
<tr><td style="padding:14px 24px 4px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F8F6F0;border-radius:10px;padding:10px 14px">
    <tr><td style="padding:4px 0;vertical-align:top;width:18px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#111;margin-top:5px"></span></td><td style="padding:4px 0;font-size:14px"><b>Embarque:</b> ${e(originFull)}</td></tr>
    ${pickups.map((p, i) => stopLine(`Busca ${i + 1}`, p)).join("")}
    ${drops.map((p, i) => stopLine(`Parada ${i + 1}`, p)).join("")}
    <tr><td style="padding:4px 0;vertical-align:top;width:18px"><span style="display:inline-block;width:10px;height:10px;background:#C9A84C;margin-top:5px"></span></td><td style="padding:4px 0;font-size:14px"><b>Destino:</b> ${e(destFull)}</td></tr>
  </table>
</td></tr>
<tr><td style="padding:10px 24px 0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">
    ${rows.map(([k, v]) => `<tr><td style="padding:6px 0;color:#777;width:170px;border-bottom:1px solid #EEE">${e(k)}</td><td style="padding:6px 0;border-bottom:1px solid #EEE"><b>${e(v)}</b></td></tr>`).join("")}
  </table>
  ${notes ? `<p style="margin:14px 0 0;padding:10px 12px;background:#FFF8E6;border-left:3px solid #C9A84C;font-size:14px"><b>Observações:</b> ${e(notes)}</p>` : ""}
</td></tr>
<tr><td style="padding:20px 24px 8px">
  <a href="${e(agendaUrl)}" style="background:#111;color:#C9A84C;padding:13px 20px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px;display:inline-block">Aprovar e escolher motorista</a>
  &nbsp;<a href="${e(mapsUrl)}" style="color:#7A6A3A;font-size:14px;font-weight:bold;text-decoration:none;display:inline-block;padding:13px 4px">Ver rota no mapa →</a>
</td></tr>
<tr><td style="padding:10px 24px 18px;font-size:11px;color:#999">ID ${e(input.tripId)}${d.clientTrips30d ? ` · ${d.clientTrips30d} pedido(s) desta empresa nos últimos 30 dias` : ""} · aviso interno da Prime Vitória</td></tr>
</table></td></tr></table></body></html>`;

  const opsInbox = resolvePortalOpsInbox();

  console.info("[portal.trip_request_email] preparando envio", {
    tripId: input.tripId,
    to: opsInbox,
    from: resolveEmailFrom(),
    resendApiKeyDefined: process.env.RESEND_API_KEY !== undefined,
    resendApiKeyLength: process.env.RESEND_API_KEY?.trim().length ?? 0
  });

  const result = await sendOperationalEmail({
    to: opsInbox,
    subject,
    text,
    html
  });

  console.info("[portal.trip_request_email] resultado", {
    tripId: input.tripId,
    sent: result.ok,
    reason: result.ok ? undefined : result.reason,
    resendId: result.ok ? result.id : undefined
  });

  if (!result.ok) {
    return { sent: false, reason: result.reason };
  }
  return { sent: true };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
