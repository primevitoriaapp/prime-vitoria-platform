import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { pushToStaff } from "@/lib/push/web-push";

const str = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

const base = {
  website: z.string().max(0).optional(), // campo-isca contra robôs
  name: z.string().trim().min(3, "Escreva seu nome completo").max(120),
  phone: z.string().trim().min(10, "Telefone com DDD").max(30),
  email: z.string().trim().email("E-mail inválido").max(200).optional().or(z.literal("")),
  city: str(80),
  utm: z.record(z.string().max(120)).optional(),
  consent: z.literal(true, { errorMap: () => ({ message: "Aceite a política de privacidade para continuar" }) })
};

const bodySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("motorista"),
    ...base,
    has_vehicle: z.enum(["sim", "nao"]),
    vehicle_model: str(80),
    vehicle_year: str(10),
    vehicle_color: str(30),
    cnh_ear: z.enum(["sim", "nao", "em_andamento"]),
    experience: z.enum(["nenhuma", "aplicativo", "executivo", "ambos"]),
    availability: str(200),
    has_cnpj: z.enum(["mei", "cnpj", "nao"]),
    notes: str(800)
  }),
  z.object({
    kind: z.literal("empresa"),
    ...base,
    company_name: z.string().trim().min(2, "Nome da empresa").max(160),
    role: str(80),
    segment: str(80),
    company_size: str(40),
    use_cases: z.array(z.string().max(60)).max(10).optional(),
    monthly_volume: str(40),
    notes: str(800)
  })
]);

const hits = new Map<string, number[]>();

/** Cadastro vindo das páginas /seja-motorista e /para-empresas. Avisa a central na hora. */
export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "x";
    const now = Date.now();
    const recent = (hits.get(ip) ?? []).filter((t) => now - t < 3600000);
    if (recent.length >= 5) return fail("RATE_LIMIT", "Muitos envios seguidos. Fale com a gente pelo WhatsApp.", 429);
    hits.set(ip, [...recent, now]);

    const b = bodySchema.parse(await request.json());
    if (b.website) return ok({ received: true });
    const tenantId = DEFAULT_TENANT_ID;
    const { website: _w, kind, name, phone, email, city, utm, consent: _c, ...rest } = b;
    const row = {
      tenant_id: tenantId,
      kind,
      name,
      phone: phone.replace(/[^\d+]/g, ""),
      email: email || null,
      city: city || null,
      company_name: kind === "empresa" ? (rest as { company_name: string }).company_name : null,
      segment: kind === "empresa" ? (rest as { segment?: string }).segment || null : null,
      company_size: kind === "empresa" ? (rest as { company_size?: string }).company_size || null : null,
      use_cases: kind === "empresa" ? ((rest as { use_cases?: string[] }).use_cases ?? null) : null,
      details: rest,
      utm: utm ?? {},
      ip_hash: createHash("sha256").update(`pv-${ip}`).digest("hex").slice(0, 24)
    };
    const { error } = await db.from("site_leads").insert(row);
    if (error) return fail("LEAD_FAILED", "Não conseguimos salvar agora. Tente de novo ou chame no WhatsApp.", 500);

    await pushToStaff(tenantId, {
      title: kind === "motorista" ? "🚘 Novo motorista quer ser parceiro" : "🏢 Nova empresa pelo site",
      body: kind === "motorista" ? `${name}${city ? ` · ${city}` : ""}` : `${row.company_name} · ${name}`,
      url: "/cadastros-site",
      tag: `lead-${kind}`
    }).catch(() => 0);

    return ok({ received: true });
  } catch (error) {
    return mapApiError(error);
  }
}
