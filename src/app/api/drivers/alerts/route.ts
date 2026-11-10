import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { ageOn, birthdayStatus, docAlert, docAlertText, type DocAlert } from "@/lib/drivers/driver-dates";

/** Painel: aniversariantes, documentos vencendo e cadastros incompletos dos motoristas ativos. */
export async function GET() {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador", "financeiro"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { data: drivers, error } = await db
      .from("drivers")
      .select("id, full_name, phone, whatsapp, birth_date, cnh_expires_at, cnh_expiry")
      .eq("tenant_id", tenantId)
      .eq("active", true);
    if (error) return fail("LIST_FAILED", error.message, 500);
    const ids = (drivers ?? []).map((d) => d.id as string);
    const { data: links } = ids.length
      ? await db.from("driver_vehicle_links").select("driver_id, vehicle_id, is_default").in("driver_id", ids).eq("active", true).is("end_at", null)
      : { data: [] };
    const vIds = [...new Set((links ?? []).map((l) => l.vehicle_id as string))];
    const { data: vehicles } = vIds.length
      ? await db.from("vehicles").select("id, plate, model, insurance_expires_at, licensing_expires_at").in("id", vIds)
      : { data: [] };
    const vBy = new Map((vehicles ?? []).map((v) => [v.id as string, v]));

    const { data: antec } = ids.length
      ? await db.from("driver_documents").select("driver_id, valid_until").in("driver_id", ids).eq("kind", "antecedentes").is("replaced_at", null)
      : { data: [] };
    const antecBy = new Map((antec ?? []).map((a) => [a.driver_id as string, a.valid_until as string | null]));
    const birthdays: { driver_id: string; name: string; phone: string | null; when: string; age: number }[] = [];
    const documents: { driver_id: string; name: string; phone: string | null; alerts: (DocAlert & { text: string; plate?: string })[] }[] = [];
    const incomplete: { driver_id: string; name: string; missing: string[] }[] = [];
    for (const d of drivers ?? []) {
      const name = String(d.full_name ?? "Motorista");
      const phone = (d.whatsapp ?? d.phone ?? null) as string | null;
      const bd = d.birth_date as string | null;
      const st = birthdayStatus(bd);
      if (st != null && bd) birthdays.push({ driver_id: d.id as string, name, phone, when: st === "today" ? "hoje" : st === "yesterday" ? "ontem" : `em ${st} dia(s)`, age: ageOn(bd) + (typeof st === "number" ? 1 : 0) });
      const cnh = (d.cnh_expires_at ?? d.cnh_expiry ?? null) as string | null;
      const mine = (links ?? []).filter((l) => l.driver_id === d.id).map((l) => vBy.get(l.vehicle_id as string)).filter(Boolean) as Record<string, unknown>[];
      const alerts: (DocAlert & { text: string; plate?: string })[] = [];
      const a = docAlert("CNH", cnh);
      if (a) alerts.push({ ...a, text: docAlertText(a) });
      for (const v of mine) {
        for (const [doc, field] of [["Seguro", "insurance_expires_at"], ["Licenciamento", "licensing_expires_at"]] as const) {
          const x = docAlert(doc, v[field] as string | null);
          if (x) alerts.push({ ...x, text: `${docAlertText(x)} · ${v.plate ?? v.model ?? "veículo"}`, plate: (v.plate as string | null) ?? undefined });
        }
      }
      const ant = docAlert("Antecedentes", antecBy.get(d.id as string) ?? null);
      if (ant) alerts.push({ ...ant, text: docAlertText(ant) });
      if (alerts.length) documents.push({ driver_id: d.id as string, name, phone, alerts });
      const missing: string[] = [];
      if (!bd) missing.push("data de nascimento");
      if (!cnh) missing.push("validade da CNH");
      if (!mine.length) missing.push("veículo vinculado");
      if (!antecBy.has(d.id as string)) missing.push("certidão de antecedentes");
      // Seguro é opcional (nem todo parceiro tem): não conta como pendência.
      if (missing.length) incomplete.push({ driver_id: d.id as string, name, missing });
    }
    const { data: withContract } = ids.length
      ? await db.from("contracts").select("driver_id").in("driver_id", ids).neq("status", "cancelado")
      : { data: [] };
    const has = new Set((withContract ?? []).map((c) => c.driver_id as string));
    const without_contract = (drivers ?? []).filter((d) => !has.has(d.id as string)).map((d) => ({ driver_id: d.id as string, name: String(d.full_name ?? "Motorista") }));
    const order = { hoje: 0, ontem: 1 } as Record<string, number>;
    birthdays.sort((x, y) => (order[x.when] ?? 2) - (order[y.when] ?? 2) || x.when.localeCompare(y.when));
    documents.sort((x, y) => Math.min(...x.alerts.map((a) => a.days)) - Math.min(...y.alerts.map((a) => a.days)));
    return ok({ birthdays, documents, incomplete, without_contract, total: (drivers ?? []).length });
  } catch (e) {
    return mapApiError(e);
  }
}
