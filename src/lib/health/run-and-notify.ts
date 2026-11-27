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
  const toAlert = slot === "manual" ? [] : slot === "tarde" ? bad.filter((i) => URGENT.has(i.key)) : bad;
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
      const text = [
        `Checagem do sistema Prime Vitória — ${stamp}`,
        "",
        ...toAlert.map((i) => `• ${i.title}: ${i.detail}${i.samples?.length ? `\n   ${i.samples.map((s) => s.label).join("\n   ")}` : ""}`),
        "",
        "Detalhes: https://central.primevitoria.com/saude"
      ].join("\n");
      const r = await sendOperationalEmail({ to: cfg.email, subject: `⚠️ Checagem Prime: ${toAlert.length} ponto(s) de atenção`, text }).catch(() => null);
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
