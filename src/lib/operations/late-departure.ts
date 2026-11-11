import { db } from "@/lib/server/db";
import { pushToDriver, pushToStaff } from "@/lib/push/web-push";
import { sendOperationalEmail } from "@/lib/notifications/send-email";
import { resolvePortalOpsInbox } from "@/lib/notifications/portal-trip-request-email";
import { OFFICIAL_URLS } from "@/lib/server/official-urls";
import { lateKindFor, pickupAtIso, type LateKind } from "@/lib/operations/late-departure-rule";

export { lateKindFor, pickupAtIso, type LateKind };

/** Lembretes ao motorista: até 4, de 10 em 10 minutos, enquanto ele não reagir. */
const NAG_MAX = 4;
const NAG_EVERY_MIN = 10;

/**
 * Quem recebe o quê (para a central não receber mensagem toda hora):
 *  - Motorista: "nao_saiu" e "nao_chegou" → e-mail + notificação no app, repetindo (até 4x, a cada 10 min).
 *  - Central: só o que precisa de ação dela, uma vez por corrida —
 *    "sem_motorista", "nao_chegou" (passou 5 min do horário) e motorista sem e-mail nem app.
 *
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
    .select("entity_id, metadata, action, created_at")
    .in("action", ["trip.late_alert", "trip.driver_nag"])
    .in("entity_id", due.map((d) => d.t.id));
  const already = new Set((sent ?? []).filter((r) => r.action === "trip.late_alert").map((r) => `${r.entity_id}:${(r.metadata as { kind?: string } | null)?.kind ?? ""}`));
  const nags = new Map<string, { n: number; last: number }>();
  for (const r of sent ?? []) {
    if (r.action !== "trip.driver_nag") continue;
    const k = `${r.entity_id}:${(r.metadata as { kind?: string } | null)?.kind ?? ""}`;
    const cur = nags.get(k) ?? { n: 0, last: 0 };
    nags.set(k, { n: cur.n + 1, last: Math.max(cur.last, new Date(String(r.created_at)).getTime()) });
  }

  const driverIds = [...new Set(due.map((d) => d.t.driver_id).filter(Boolean))] as string[];
  const clientIds = [...new Set(due.map((d) => d.t.client_id).filter(Boolean))] as string[];
  const [{ data: drivers }, { data: clients }] = await Promise.all([
    driverIds.length ? db.from("drivers").select("id, full_name, phone, email").in("id", driverIds) : Promise.resolve({ data: [] }),
    clientIds.length ? db.from("clients").select("id, name, trade_name").in("id", clientIds) : Promise.resolve({ data: [] })
  ]);
  const drv = new Map((drivers ?? []).map((d) => [d.id as string, d as { full_name?: string; phone?: string; email?: string | null }]));
  const cli = new Map((clients ?? []).map((c) => [c.id as string, String((c as { trade_name?: string }).trade_name || (c as { name?: string }).name || "")]));

  let alerted = 0;
  for (const { t, kind } of due) {
    const at = hhmm(pickupAtIso(t));
    const d = t.driver_id ? drv.get(t.driver_id) : undefined;
    const who = d?.full_name?.split(" ").slice(0, 2).join(" ") ?? "motorista";
    const pax = t.passenger_name?.trim() || "passageiro";
    const empresa = t.client_id ? cli.get(t.client_id) : "";

    // 1) Motorista: lembrete repetido (e-mail + app) enquanto não reagir.
    if (t.driver_id && (kind === "nao_saiu" || kind === "nao_chegou")) {
      const k = `${t.id}:${kind}`;
      const h = nags.get(k) ?? { n: 0, last: 0 };
      if (h.n < NAG_MAX && now - h.last >= NAG_EVERY_MIN * 60000 - 30000) {
        await db.from("audit_events").insert({ tenant_id: t.tenant_id, action: "trip.driver_nag", entity_type: "trip", entity_id: t.id, metadata: { kind, n: h.n + 1 } });
        const pushes = await pushToDriver(t.tenant_id, t.driver_id, {
          title: kind === "nao_saiu" ? `⏰ Embarque às ${at} — toque em “Sair para buscar”` : `📍 Embarque era às ${at} — toque em “Cheguei”`,
          body: `${pax} · ${short(t.origin_text)}. Plantão Prime Vitória acompanhando seu serviço.`,
          url: `/driver?trip=${encodeURIComponent(t.id)}`,
          tag: `trip-${t.id}`,
          tripId: t.id
        }).catch(() => 0);
        const mailed = d?.email ? await sendDriverNagEmail(d.email, { first: who.split(" ")[0], at, pax, place: short(t.origin_text), kind, n: h.n + 1, tripId: t.id }).catch(() => false) : false;
        alerted += 1;
        // Sem e-mail e sem app: a central precisa ligar (uma vez só).
        if (!pushes && !mailed && !already.has(`${t.id}:sem_contato`)) {
          already.add(`${t.id}:sem_contato`);
          await db.from("audit_events").insert({ tenant_id: t.tenant_id, action: "trip.late_alert", entity_type: "trip", entity_id: t.id, metadata: { kind: "sem_contato" } });
          await staffAlert(t, `📵 ${who} não recebe avisos (sem app e sem e-mail) · ${at}`, `${pax}${empresa ? ` (${empresa})` : ""} · ${short(t.origin_text)}${d?.phone ? ` · ligue: ${d.phone}` : ""}`);
        }
      }
    }

    // 2) Central: só o que precisa dela, uma vez por corrida.
    if (kind === "nao_saiu") continue;
    if (already.has(`${t.id}:${kind}`)) continue;
    await db.from("audit_events").insert({ tenant_id: t.tenant_id, action: "trip.late_alert", entity_type: "trip", entity_id: t.id, metadata: { kind } });
    const title = kind === "sem_motorista" ? `⚠ Sem motorista · embarque ${at}` : `🚨 ${who} não chegou · era ${at}`;
    const body = `${pax}${empresa ? ` (${empresa})` : ""} · ${short(t.origin_text)}${d?.phone ? ` · tel ${d.phone}` : ""}`;
    await staffAlert(t, title, body);
    alerted += 1;
  }
  return { checked: trips.length, alerted };
}

async function staffAlert(t: TripRow, title: string, body: string) {
  const url = `/agenda?trip=${t.id}`;
  await pushToStaff(t.tenant_id, { title, body, url, tag: `late-${t.id}`, tripId: t.id }).catch(() => 0);
  await sendOperationalEmail({
    to: resolvePortalOpsInbox(),
    subject: title,
    text: `${title}\n\n${body}\n\nAbrir a corrida: ${OFFICIAL_URLS.central}${url}`,
    html: `<p style="font-size:16px"><b>${esc(title)}</b></p><p>${esc(body)}</p><p><a href="${esc(OFFICIAL_URLS.central + url)}" style="background:#111;color:#C9A84C;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:bold">Abrir a corrida</a></p>`
  }).catch(() => null);
}

/** E-mail educado e firme para o motorista usar o app (o uso é obrigatório nos atendimentos Prime). */
async function sendDriverNagEmail(to: string, x: { first: string; at: string; pax: string; place: string; kind: "nao_saiu" | "nao_chegou"; n: number; tripId: string }): Promise<boolean> {
  const link = `${OFFICIAL_URLS.motorista}/driver?trip=${encodeURIComponent(x.tripId)}`;
  const acao = x.kind === "nao_saiu" ? "“Sair para buscar”" : "“Cheguei”";
  const subject = `${x.n > 1 ? `(${x.n}º aviso) ` : ""}${x.first}, abra o aplicativo — embarque às ${x.at} · Plantão Prime Vitória`;
  const lines = [
    `Olá, ${x.first}.`,
    `Aqui é o plantão da Prime Vitória. Estamos acompanhando o seu serviço de hoje (embarque às ${x.at} · ${x.pax} · ${x.place}) e notamos que você ainda não marcou ${acao} no aplicativo.`,
    `Por gentileza, abra o aplicativo agora e toque em ${acao}. O uso do aplicativo é obrigatório em todos os atendimentos da Prime Vitória: é por ele que acompanhamos o serviço, avisamos o cliente e calculamos espera e hora extra.`,
    `Se houver algum imprevisto, avise a central imediatamente.`,
    `Obrigado!`,
    `Plantão Prime Vitória`
  ];
  const r = await sendOperationalEmail({
    to,
    subject,
    text: `${lines.join("\n\n")}\n\nAbrir o aplicativo: ${link}`,
    html: `${lines.map((l) => `<p style="font-size:15px;line-height:1.5">${esc(l)}</p>`).join("")}<p><a href="${esc(link)}" style="background:#111;color:#C9A84C;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block">Abrir o aplicativo</a></p>`
  });
  return r.ok;
}

function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}
