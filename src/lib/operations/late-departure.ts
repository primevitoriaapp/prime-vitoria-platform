import { db } from "@/lib/server/db";
import { pushToDriver, pushToStaff } from "@/lib/push/web-push";
import { sendOperationalEmail } from "@/lib/notifications/send-email";
import { resolvePortalOpsInbox } from "@/lib/notifications/portal-trip-request-email";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";
import { lateKindFor, pickupAtIso, type LateKind } from "@/lib/operations/late-departure-rule";

export { lateKindFor, pickupAtIso, type LateKind };

/**
 * Vigia de atraso (roda a cada 5 min):
 *  - "sem_motorista": falta ≤ 60 min e a corrida ainda não tem motorista.
 *  - "nao_saiu": falta ≤ 30 min e o motorista ainda não tocou em "Sair para buscar".
 *  - "nao_chegou": passou 5 min do horário e o motorista não marcou "Cheguei".
 * Cada aviso sai uma vez só por corrida (fica registrado no histórico).
 */

type TripRow = {
  id: string;
  tenant_id: string;
  scheduled_at: string;
  presentation_minutes: number | null;
  operational_status: string;
  driver_id: string | null;
  passenger_name: string | null;
  origin_text: string | null;
  client_id: string | null;
};

const TZ = "America/Sao_Paulo";
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const short = (s: string | null) => String(s ?? "").split(",")[0].trim() || "—";

export async function scanLateDepartures(now = Date.now()) {
  const from = new Date(now - 3 * 3600_000).toISOString();
  const to = new Date(now + 3 * 3600_000).toISOString();
  const { data, error } = await db
    .from("trips")
    .select("id, tenant_id, scheduled_at, presentation_minutes, operational_status, driver_id, passenger_name, origin_text, client_id")
    .gte("scheduled_at", from)
    .lte("scheduled_at", to)
    .in("operational_status", ["requested", "approved", "dispatched", "accepted", "reassigned", "on_the_way"]);
  if (error) throw new Error(error.message);
  const trips = (data ?? []) as TripRow[];
  const due = trips.map((t) => ({ t, kind: lateKindFor(t, now) })).filter((x): x is { t: TripRow; kind: LateKind } => x.kind != null);
  if (!due.length) return { checked: trips.length, alerted: 0 };

  const { data: sent } = await db
    .from("audit_events")
    .select("entity_id, metadata")
    .eq("action", "trip.late_alert")
    .in("entity_id", due.map((d) => d.t.id));
  const already = new Set((sent ?? []).map((r) => `${r.entity_id}:${(r.metadata as { kind?: string } | null)?.kind ?? ""}`));

  const driverIds = [...new Set(due.map((d) => d.t.driver_id).filter(Boolean))] as string[];
  const clientIds = [...new Set(due.map((d) => d.t.client_id).filter(Boolean))] as string[];
  const [{ data: drivers }, { data: clients }] = await Promise.all([
    driverIds.length ? db.from("drivers").select("id, full_name, phone").in("id", driverIds) : Promise.resolve({ data: [] }),
    clientIds.length ? db.from("clients").select("id, name, trade_name").in("id", clientIds) : Promise.resolve({ data: [] })
  ]);
  const drv = new Map((drivers ?? []).map((d) => [d.id as string, d as { full_name?: string; phone?: string }]));
  const cli = new Map((clients ?? []).map((c) => [c.id as string, String((c as { trade_name?: string }).trade_name || (c as { name?: string }).name || "")]));

  let alerted = 0;
  for (const { t, kind } of due) {
    if (already.has(`${t.id}:${kind}`)) continue;
    // Marca antes de avisar: se o aviso falhar, não repete a cada 5 minutos.
    await db.from("audit_events").insert({ tenant_id: t.tenant_id, action: "trip.late_alert", entity_type: "trip", entity_id: t.id, metadata: { kind } });
    const at = hhmm(pickupAtIso(t));
    const d = t.driver_id ? drv.get(t.driver_id) : undefined;
    const who = d?.full_name?.split(" ").slice(0, 2).join(" ") ?? "motorista";
    const pax = t.passenger_name?.trim() || "passageiro";
    const empresa = t.client_id ? cli.get(t.client_id) : "";
    const title =
      kind === "sem_motorista" ? `⚠ Sem motorista · embarque ${at}` : kind === "nao_saiu" ? `⏰ ${who} ainda não saiu · ${at}` : `🚨 ${who} não chegou · era ${at}`;
    const body = `${pax}${empresa ? ` (${empresa})` : ""} · ${short(t.origin_text)}${d?.phone ? ` · tel ${d.phone}` : ""}`;
    const url = `/agenda?trip=${t.id}`;
    await pushToStaff(t.tenant_id, { title, body, url, tag: `late-${t.id}-${kind}`, tripId: t.id }).catch(() => 0);
    await sendOperationalEmail({
      to: resolvePortalOpsInbox(),
      subject: `${title} · ${pax}`,
      text: `${title}\n\n${body}\n\nAbrir a corrida: ${OFFICIAL_URLS.central}${url}`,
      html: `<p style="font-size:16px"><b>${esc(title)}</b></p><p>${esc(body)}</p><p><a href="${esc(OFFICIAL_URLS.central + url)}" style="background:#111;color:#C9A84C;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir a corrida</a></p>`
    }).catch(() => null);
    if (t.driver_id && kind === "nao_saiu") {
      await pushToDriver(t.tenant_id, t.driver_id, {
        title: `⏰ Embarque às ${at} — hora de sair`,
        body: `${pax} · ${short(t.origin_text)}. Ao sair, toque em “Sair para buscar”.`,
        url: `/driver?trip=${encodeURIComponent(t.id)}`,
        tag: `trip-${t.id}`,
        tripId: t.id
      }).catch(() => 0);
    }
    alerted += 1;
  }
  return { checked: trips.length, alerted };
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}
