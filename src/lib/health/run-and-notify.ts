import { db } from "@/lib/server/db";
import { pushToStaff } from "@/lib/push/web-push";
import { sendOperationalEmail } from "@/lib/notifications/send-email";
import { getWhatsappCloudConfig, cloudReady, sendWhatsappTemplate } from "@/lib/messages/whatsapp-cloud";
import { CENTRAL_TEMPLATES } from "@/lib/messages/passenger-whatsapp-templates";
import { healthSummaryLine, runSystemCheck, type HealthItem } from "@/lib/health/system-check";

/** Para onde vão os alertas (Saúde do sistema → Alertas). */
export type HealthAlertConfig = { phone: string; email: string; whatsapp: boolean; send_email: boolean; push: boolean };

export const DEFAULT_ALERTS: HealthAlertConfig = { phone: "", email: "contato@primevitoria.com", whatsapp: true, send_email: true, push: true };

export async function getHealthAlertConfig(): Promise<HealthAlertConfig> {
  const { data } = await db.from("app_secrets").select("value").eq("key", "health_alerts").maybeSingle();
  return { ...DEFAULT_ALERTS, ...((data?.value ?? {}) as Partial<HealthAlertConfig>) };
}

export async function saveHealthAlertConfig(c: HealthAlertConfig): Promise<void> {
  await db.from("app_secrets").upsert({ key: "health_alerts", value: c }, { onConflict: "key" });
}

/** Na rodada da tarde só avisa o que é urgente (motorista faltando para amanhã, automação parada). */
const URGENT = new Set(["sem_motorista", "agendador"]);

export type HealthRun = { id: number | null; items: HealthItem[]; problems: number; critical: number; notified: Record<string, unknown> };

/**
 * Roda a checagem, guarda o resultado e avisa o dono (push no painel, WhatsApp e e-mail) quando há problema.
 * slot "manha": avisa tudo que estiver pendente; "tarde": só o urgente; "manual": não avisa (a pessoa já está olhando).
 */
export async function runHealthCheck(tenantId: string, slot: "manha" | "tarde" | "manual"): Promise<HealthRun> {
  const items = await runSystemCheck(tenantId);
  const bad = items.filter((i) => i.level !== "ok");
  const critical = bad.filter((i) => i.level === "critico").length;
  // Repasses têm datas variadas: lembra só às segundas de manhã (na página aparecem sempre).
  const monday = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" }).format(new Date()) === "Mon";
  const morning = bad.filter((i) => i.key !== "repasses_vencidos" || monday);
  const toAlert = slot === "manual" ? [] : slot === "tarde" ? bad.filter((i) => URGENT.has(i.key)) : morning;
  const notified: Record<string, unknown> = {};

  if (toAlert.length) {
    const cfg = await getHealthAlertConfig();
    const line = healthSummaryLine(toAlert);
    const stamp = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " às");

    if (cfg.push) {
      notified.push = await pushToStaff(tenantId, { title: "⚠️ Checagem do sistema", body: line, url: "/saude", tag: "health-check" }, ["admin"]).catch(() => 0);
    }

    if (cfg.whatsapp && cfg.phone.replace(/\D/g, "").length >= 10) {
      const wc = await getWhatsappCloudConfig();
      if (cloudReady(wc) && wc.mode !== "desligado") {
        const r = await sendWhatsappTemplate(wc, cfg.phone, CENTRAL_TEMPLATES[0], [stamp, line.slice(0, 900)], "saude");
        notified.whatsapp = r.ok ? "enviado" : `falhou: ${r.error}`;
      } else notified.whatsapp = "WhatsApp desligado";
    }

    if (cfg.send_email && /@/.test(cfg.email)) {
      const html = healthEmailHtml(toAlert, stamp);
      const text = [
        `Checagem do sistema Prime Vitória — ${stamp}`,
        "",
        ...toAlert.map((i) => `• ${i.title}: ${i.detail}${i.samples?.length ? `\n   ${i.samples.map((s) => s.label).join("\n   ")}` : ""}`),
        "",
        "Detalhes: https://central.primevitoria.com/saude"
      ].join("\n");
      const r = await sendOperationalEmail({ to: cfg.email, subject: `⚠️ Checagem Prime: ${line.slice(0, 120)}`, text, html }).catch(() => null);
      notified.email = r && "ok" in r && r.ok ? "enviado" : "falhou";
    }
  }

  const { data } = await db
    .from("system_health_checks")
    .insert({ tenant_id: tenantId, trigger: slot, problems: bad.length, critical, items, notified })
    .select("id")
    .single();
  // Guarda só os últimos 90 dias.
  await db.from("system_health_checks").delete().eq("tenant_id", tenantId).lt("ran_at", new Date(Date.now() - 90 * 864e5).toISOString());
  return { id: (data?.id as number) ?? null, items, problems: bad.length, critical, notified };
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const BASE = "https://central.primevitoria.com";

/** E-mail organizado: um cartão por assunto, com a lista e o botão para resolver. */
function healthEmailHtml(items: HealthItem[], stamp: string): string {
  const cards = items
    .map((i) => {
      const red = i.level === "critico";
      const list = (i.samples ?? [])
        .map((s) => `<li style="margin:4px 0">${s.href ? `<a href="${BASE}${s.href}" style="color:#111">${esc(s.label)}</a>` : esc(s.label)}</li>`)
        .join("");
      return `<div style="border:1px solid ${red ? "#F3C2C2" : "#EADFC4"};background:${red ? "#FFF5F5" : "#FFFBF2"};border-radius:12px;padding:14px 16px;margin:0 0 12px">
  <div style="font-size:12px;font-weight:700;color:${red ? "#B42318" : "#8A6A12"};letter-spacing:.5px">${red ? "RESOLVER HOJE" : "ATENÇÃO"}</div>
  <div style="font-size:16px;font-weight:700;margin:4px 0 6px;color:#111">${esc(i.title)}</div>
  <div style="font-size:14px;color:#333">${esc(i.detail)}</div>
  ${list ? `<ul style="padding-left:18px;margin:8px 0 0;font-size:14px">${list}</ul>` : ""}
  ${i.href ? `<a href="${BASE}${i.href}" style="display:inline-block;margin-top:10px;font-size:14px;font-weight:700;color:#8A6A12">Resolver →</a>` : ""}
</div>`;
    })
    .join("");
  return `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
  <div style="background:#111;border-radius:12px;padding:16px 18px;margin-bottom:14px">
    <div style="color:#C9A84C;font-size:12px;font-weight:700;letter-spacing:1px">PRIME VITÓRIA · CHECAGEM DO SISTEMA</div>
    <div style="color:#fff;font-size:18px;font-weight:700;margin-top:4px">${items.length} ponto(s) precisam de atenção</div>
    <div style="color:#bbb;font-size:13px;margin-top:2px">${esc(stamp)}</div>
  </div>
  ${cards}
  <a href="${BASE}/saude" style="display:block;text-align:center;background:#C9A84C;color:#111;font-weight:700;text-decoration:none;border-radius:10px;padding:12px;margin-top:6px">Abrir a checagem completa</a>
</div>`;
}
