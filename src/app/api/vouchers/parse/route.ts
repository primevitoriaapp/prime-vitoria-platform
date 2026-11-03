import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { parseCepVoucher } from "@/lib/vouchers/cep-voucher";
import { voucherToLegs } from "@/lib/vouchers/voucher-legs";
import { getClientCategoryPrices, listVehicleCategories } from "@/lib/pricing/vehicle-categories";

const schema = z.object({
  words: z
    .array(z.object({ page: z.number().int().min(1).max(50), x: z.number(), y: z.number(), text: z.string().max(300) }))
    .min(1)
    .max(20000)
});

const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * Lê o voucher (texto do PDF extraído no navegador) e devolve as corridas sugeridas para conferir.
 * Hoje reconhece o formato da CEP Transportes; outros formatos entram aqui depois (leitor por IA).
 */
export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "trip.write");
    const tenantId = assertTenantScope(session);
    const { words } = schema.parse(await request.json());

    const voucher = parseCepVoucher(words);
    if (!voucher || voucher.items.length === 0) {
      return fail(
        "VOUCHER_FORMAT_UNKNOWN",
        "Ainda não sei ler este modelo de voucher. Hoje o sistema lê os vouchers da CEP Transportes. Mande este modelo para a gente incluir.",
        422
      );
    }

    const cats = await listVehicleCategories(tenantId);
    const legs = voucherToLegs(
      voucher,
      cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))
    );

    // Cliente pelo CNPJ de quem mandou o voucher.
    let client: { id: string; name: string } | null = null;
    const cnpj = digits(voucher.issuerCnpj);
    if (cnpj) {
      const { data: clients } = await db.from("clients").select("id, name, trade_name, document").eq("tenant_id", tenantId).not("document", "is", null).limit(5000);
      const hit = (clients ?? []).find((c) => digits(c.document as string) === cnpj);
      if (hit) client = { id: hit.id as string, name: ((hit.trade_name as string) || (hit.name as string)) ?? "Cliente" };
    }

    // Valor do motorista pela tabela do parceiro desse cliente (transfer), quando houver.
    if (client) {
      const prices = await getClientCategoryPrices(client.id).catch(() => []);
      for (const l of legs) {
        if (/-[A-Z]\d$/.test(l.ref)) continue; // partes do "disponível": valor do motorista a combinar
        const p = prices.find((x) => x.category_id === l.categoryId && x.service === "transfer" && x.enabled);
        if (p?.partner_price != null) l.driverAmount = String(p.partner_price).replace(".", ",");
      }
    }

    // Já importado? Procura a referência do voucher nas corridas.
    const existingRefs: string[] = [];
    if (voucher.number) {
      const { data: trips } = await db.from("trips").select("notes").eq("tenant_id", tenantId).ilike("notes", `%${voucher.number}%`).limit(50);
      const text = (trips ?? []).map((t) => (t.notes as string) ?? "").join("\n");
      for (const l of legs) if (text.includes(`O.S./Ref.: ${l.ref}`)) existingRefs.push(l.ref);
    }

    return ok({
      voucher: { number: voucher.number, event: voucher.event, requestedBy: voucher.requestedBy, issuer: voucher.issuerName, cnpj: voucher.issuerCnpj },
      client,
      legs,
      existingRefs
    });
  } catch (error) {
    return mapApiError(error);
  }
}
