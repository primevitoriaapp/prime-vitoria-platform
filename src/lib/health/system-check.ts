import { db } from "@/lib/server/db";

/** Um ponto da checagem: crítico (resolver hoje), atenção (olhar) ou ok. */
export type HealthItem = {
  key: string;
  level: "critico" | "atencao" | "ok";
  title: string;
  detail: string;
  count: number;
  href?: string;
  /** Até 8 exemplos (corrida, motorista, fatura) para clicar. */
  samples?: { label: string; href?: string }[];
};

const SP = "America/Sao_Paulo";
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
/** "hoje 13:30", "amanhã 14:50" ou "25/11 15:55". */
const when = (iso: string) => {
  const d = new Date(iso);
  const ymd = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: SP }).format(x);
  const hm = d.toLocaleTimeString("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit" });
  const today = ymd(new Date());
  const tomorrow = ymd(new Date(Date.now() + 864e5));
  if (ymd(d) === today) return `hoje ${hm}`;
  if (ymd(d) === tomorrow) return `amanhã ${hm}`;
  return `${d.toLocaleDateString("pt-BR", { timeZone: SP, day: "2-digit", month: "2-digit" })} ${hm}`;
};
const todayYmd = () => new Intl.DateTimeFormat("en-CA", { timeZone: SP }).format(new Date());
const tripHref = (id: string) => `/agenda?trip=${id}#trip-detail`;
type TripRow = { id: string; scheduled_at: string; passenger_name: string | null; clients?: { name?: string | null; trade_name?: string | null } | null };
/** "Hoje 13:30 · Companhia de Ópera · Marília, Cintia" */
function tripLabel(t: TripRow): string {
  const c = t.clients?.trade_name || t.clients?.name || null;
  return [when(t.scheduled_at), c, t.passenger_name].filter(Boolean).join(" · ");
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function item(key: string, level: HealthItem["level"], title: string, count: number, detail: string, href?: string, samples?: HealthItem["samples"]): HealthItem {
  return { key, level: count > 0 ? level : "ok", title, count, detail: count > 0 ? detail : "Tudo certo.", href, samples: count > 0 ? samples : undefined };
}

const OPEN = ["requested", "approved", "dispatched", "accepted", "on_the_way", "arrived", "in_progress", "reassigned"];

/**
 * Checagem do sistema para um tenant. Só leitura: não muda nada, só aponta o que precisa de atenção.
 * Pensada para rodar às 7h e às 18h (e quando o dono clica em "Checar agora").
 */
export async function runSystemCheck(tenantId: string): Promise<HealthItem[]> {
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const h = 3600_000;
  const today = todayYmd();

  const [noDriver, toApprove, stale, noValue, waDriver, waPax, emailFail, priceFail, invoices, payables, drivers, sched] = await Promise.all([
    // 1. Corridas das próximas 30 h sem motorista.
    db
      .from("trips")
      .select("id, scheduled_at, passenger_name, origin_text, clients(name, trade_name)")
      .eq("tenant_id", tenantId)
      .is("driver_id", null)
      .in("operational_status", ["requested", "approved", "reassigned"])
      .gte("scheduled_at", iso(now))
      .lte("scheduled_at", iso(now + 30 * h))
      .order("scheduled_at")
      .limit(50),
    // 2. Pedidos esperando aprovação (próximos 3 dias).
    db
      .from("trips")
      .select("id, scheduled_at, passenger_name")
      .eq("tenant_id", tenantId)
      .eq("operational_status", "requested")
      .gte("scheduled_at", iso(now - 6 * h))
      .lte("scheduled_at", iso(now + 72 * h))
      .order("scheduled_at")
      .limit(50),
    // 3. Corridas que já passaram há mais de 3 h e não foram finalizadas.
    db
      .from("trips")
      .select("id, scheduled_at, passenger_name, clients(name, trade_name)")
      .eq("tenant_id", tenantId)
      .in("operational_status", OPEN)
      .lt("scheduled_at", iso(now - 3 * h))
      .gte("scheduled_at", iso(now - 30 * 24 * h))
      .order("scheduled_at")
      .limit(50),
    // 4. Concluídas nos últimos 45 dias sem valor para o cliente (não entram na fatura certa).
    db
      .from("trips")
      .select("id, scheduled_at, passenger_name, client_amount")
      .eq("tenant_id", tenantId)
      .eq("operational_status", "completed")
      .gte("scheduled_at", iso(now - 45 * 24 * h))
      .or("client_amount.is.null,client_amount.eq.0")
      .order("scheduled_at")
      .limit(50),
    // 5. WhatsApp que falhou nas últimas 24 h.
    db.from("driver_whatsapp_notices").select("id, trip_id, detail, created_at").eq("tenant_id", tenantId).eq("status", "falhou").gte("created_at", iso(now - 24 * h)).limit(50),
    db.from("passenger_notifications").select("id, trip_id, detail, created_at").eq("tenant_id", tenantId).eq("status", "falhou").gte("created_at", iso(now - 24 * h)).limit(50),
    // 6. E-mails que falharam e preço que não foi aplicado (24 h).
    db.from("audit_events").select("id, entity_id, metadata, created_at").eq("tenant_id", tenantId).eq("action", "notification.email_failed").gte("created_at", iso(now - 24 * h)).limit(50),
    db.from("audit_events").select("id, entity_id, created_at").eq("tenant_id", tenantId).eq("action", "finance.pricing_apply_failed").gte("created_at", iso(now - 24 * h)).limit(50),
    // 7. Faturas enviadas e vencidas.
    db.from("client_invoices").select("id, number, total_amount, due_date, client_id").eq("tenant_id", tenantId).eq("status", "enviada").lt("due_date", today).order("due_date").limit(100),
    // 8. Repasses a motoristas vencidos e não pagos.
    db.from("driver_payables").select("id, amount, due_date").eq("tenant_id", tenantId).eq("status", "open").lt("due_date", today).limit(500),
    // 9. CNH vencendo nos próximos 30 dias (motoristas ativos).
    db.from("drivers").select("id, full_name, cnh_expires_at, cnh_expiry, active").eq("tenant_id", tenantId).eq("active", true).limit(500),
    // 10. Tarefas automáticas (agendador) com falha.
    db.rpc("health_scheduler_failures", { p_hours: 24 })
  ]);

  const out: HealthItem[] = [];

  const nd = (noDriver.data ?? []) as unknown as TripRow[];
  out.push(
    item(
      "sem_motorista",
      "critico",
      "Corridas das próximas 30 h sem motorista",
      nd.length,
      `${plural(nd.length, "corrida", "corridas")} sem motorista escalado. A primeira é ${nd[0] ? when(nd[0].scheduled_at) : ""}.`,
      "/dispatch",
      nd.slice(0, 8).map((t) => ({ label: tripLabel(t), href: tripHref(t.id) }))
    )
  );

  const ta = (toApprove.data ?? []) as { id: string; scheduled_at: string; passenger_name: string | null }[];
  out.push(
    item(
      "aprovar",
      "atencao",
      "Pedidos esperando aprovação",
      ta.length,
      `${plural(ta.length, "pedido", "pedidos")} de cliente ainda não aprovado(s).`,
      "/conferencia",
      ta.slice(0, 8).map((t) => ({ label: `${when(t.scheduled_at)} · ${t.passenger_name ?? ""}`, href: tripHref(t.id) }))
    )
  );

  const st = (stale.data ?? []) as unknown as TripRow[];
  out.push(
    item(
      "nao_finalizadas",
      "atencao",
      "Corridas que já passaram e não foram finalizadas",
      st.length,
      `${plural(st.length, "corrida", "corridas")} com horário passado há mais de 3 h e ainda abertas. Sem finalizar, não entram na fatura nem no repasse.`,
      "/agenda",
      st.slice(0, 8).map((t) => ({ label: tripLabel(t), href: tripHref(t.id) }))
    )
  );

  const nv = (noValue.data ?? []) as { id: string; scheduled_at: string; passenger_name: string | null }[];
  out.push(
    item(
      "sem_valor",
      "atencao",
      "Corridas concluídas sem valor",
      nv.length,
      `${plural(nv.length, "corrida concluída", "corridas concluídas")} nos últimos 45 dias com valor R$ 0. Vão para a fatura zeradas.`,
      "/agenda",
      nv.slice(0, 8).map((t) => ({ label: `${when(t.scheduled_at)} · ${t.passenger_name ?? ""}`, href: tripHref(t.id) }))
    )
  );

  const wa = [...((waDriver.data ?? []) as { trip_id: string | null; detail: string | null }[]), ...((waPax.data ?? []) as { trip_id: string | null; detail: string | null }[])];
  out.push(
    item(
      "whatsapp",
      "atencao",
      "Avisos de WhatsApp que falharam (24 h)",
      wa.length,
      `${plural(wa.length, "aviso não chegou", "avisos não chegaram")}. Motivo mais recente: ${wa[0]?.detail ?? "não informado"}.`,
      "/integracoes",
      wa.slice(0, 8).map((w) => ({ label: w.detail ?? "Falhou", href: w.trip_id ? tripHref(w.trip_id) : undefined }))
    )
  );

  const ef = (emailFail.data ?? []) as { metadata: Record<string, unknown> | null }[];
  out.push(item("email", "atencao", "E-mails que falharam (24 h)", ef.length, `${plural(ef.length, "e-mail não saiu", "e-mails não saíram")} (fatura, orçamento ou aviso).`, "/audit?action=notification.email_failed"));

  const pf = (priceFail.data ?? []) as { entity_id: string | null }[];
  out.push(
    item(
      "preco",
      "atencao",
      "Preço que não foi aplicado (24 h)",
      pf.length,
      `${plural(pf.length, "corrida ficou", "corridas ficaram")} sem o preço automático. Confira o valor.`,
      "/audit?action=finance.pricing_apply_failed",
      pf.slice(0, 8).map((p) => ({ label: "Abrir corrida", href: p.entity_id ? tripHref(p.entity_id) : undefined }))
    )
  );

  const inv = (invoices.data ?? []) as { id: string; number: number | null; total_amount: number | null; due_date: string }[];
  const invSum = inv.reduce((s, i) => s + (Number(i.total_amount) || 0), 0);
  out.push(
    item(
      "faturas_vencidas",
      "atencao",
      "Faturas vencidas e não pagas",
      inv.length,
      `${plural(inv.length, "fatura vencida", "faturas vencidas")}, somando ${brl(invSum)}. Cobre o cliente ou marque como paga se já recebeu.`,
      "/finance",
      inv.slice(0, 8).map((i) => ({ label: `Fatura nº ${i.number ?? "—"} · venceu ${i.due_date.split("-").reverse().slice(0, 2).join("/")} · ${brl(Number(i.total_amount) || 0)}` }))
    )
  );

  const pay = (payables.data ?? []) as { amount: number | null }[];
  const paySum = pay.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  out.push(item("repasses_vencidos", "atencao", "Repasses a motoristas vencidos", pay.length, `${plural(pay.length, "repasse", "repasses")} com data vencida, somando ${brl(paySum)}.`, "/repasses"));

  const lim = new Date(now + 30 * 24 * h).toISOString().slice(0, 10);
  const cnh = ((drivers.data ?? []) as { id: string; full_name: string | null; cnh_expires_at: string | null; cnh_expiry: string | null }[])
    .map((d) => ({ ...d, exp: (d.cnh_expires_at || d.cnh_expiry || "").slice(0, 10) }))
    .filter((d) => d.exp && d.exp <= lim)
    .sort((a, b) => a.exp.localeCompare(b.exp));
  out.push(
    item(
      "cnh",
      "atencao",
      "CNH de motorista vencida ou vencendo (30 dias)",
      cnh.length,
      `${plural(cnh.length, "motorista", "motoristas")} com CNH vencida ou vencendo.`,
      "/drivers",
      cnh.slice(0, 8).map((d) => ({ label: `${d.full_name ?? "Motorista"} · ${d.exp < today ? "venceu" : "vence"} ${d.exp.split("-").reverse().join("/")}` }))
    )
  );

  const sf = ((sched.data ?? []) as { source: string; failures: number; last_message: string | null }[]).filter((r) => Number(r.failures) > 0);
  const sfCount = sf.reduce((s, r) => s + Number(r.failures), 0);
  out.push(
    item(
      "agendador",
      "critico",
      "Tarefas automáticas com falha (24 h)",
      sched.error ? 1 : sfCount,
      sched.error
        ? "Não consegui consultar as tarefas automáticas."
        : `${plural(sfCount, "falha", "falhas")} nas tarefas automáticas (avisos, contratos, atrasos). Última: ${sf[0]?.last_message ?? "—"}.`
    )
  );

  return out;
}

/** Resumo curto (uma linha) do que precisa de atenção, para WhatsApp/push. */
export function healthSummaryLine(items: HealthItem[]): string {
  const bad = items.filter((i) => i.level !== "ok");
  const short: Record<string, (n: number) => string> = {
    sem_motorista: (n) => `${plural(n, "corrida", "corridas")} sem motorista`,
    aprovar: (n) => `${plural(n, "pedido", "pedidos")} para aprovar`,
    nao_finalizadas: (n) => `${plural(n, "corrida", "corridas")} sem finalizar`,
    sem_valor: (n) => `${plural(n, "corrida", "corridas")} sem valor`,
    whatsapp: (n) => `${plural(n, "WhatsApp", "WhatsApps")} com falha`,
    email: (n) => `${plural(n, "e-mail", "e-mails")} com falha`,
    preco: (n) => `${plural(n, "preço", "preços")} não aplicado(s)`,
    faturas_vencidas: (n) => `${plural(n, "fatura vencida", "faturas vencidas")}`,
    repasses_vencidos: (n) => `${plural(n, "repasse vencido", "repasses vencidos")}`,
    cnh: (n) => `${plural(n, "CNH", "CNHs")} vencendo`,
    agendador: () => "falha nas tarefas automáticas"
  };
  return bad.map((i) => (short[i.key] ? short[i.key](i.count) : i.title)).join(" · ");
}
