import { z } from "zod";
import { canManageClientTeam } from "@/lib/clients/client-portal-team-access";
import { getClientTenantId } from "@/lib/clients/client-tenant";
import { createClientPassenger, normalizeCpf, updateClientPassenger, type ClientPassengerRow } from "@/lib/clients/client-passengers";
import { grantPortalAccess } from "@/lib/clients/client-portal-login";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { assertCapability } from "@/lib/security/rbac";
import { enforceRateLimit } from "@/lib/security/rate-limit";

const row = z.object({
  name: z.string().min(2).max(160),
  cpf: z.string().max(20).nullable().optional(),
  email: z.string().max(254).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  postal_code: z.string().max(12).nullable().optional(),
  sector: z.string().max(120).nullable().optional(),
  matricula: z.string().max(60).nullable().optional(),
  can_request: z.boolean().optional(),
  allowed_category_ids: z.array(z.string().uuid()).max(30).nullable().optional()
});
const schema = z.object({ rows: z.array(z.unknown()).min(1).max(500), invite: z.boolean().optional() });

function requestOrigin(request: Request): string {
  const h = request.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : new URL(request.url).origin;
}

/** Importa (ou atualiza) os funcionários da empresa a partir da planilha. Casa por CPF, depois por e-mail. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    if (session.role === "cliente") {
      if (session.clientId !== id || !(await canManageClientTeam(session, id))) return fail("FORBIDDEN", "Só o gestor da conta pode importar funcionários.", 403);
    } else assertCapability(session, "client.write");
    const { data: client } = await db.from("clients").select("id").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!client) return fail("CLIENT_NOT_FOUND", "Cliente não encontrado", 404);
    enforceRateLimit(`team-import:${session.userId}`, 60, 10 * 60_000); // blocos de 15 linhas → até ~900 por vez

    const body = schema.parse(await request.json());
    const clientTenantId = await getClientTenantId(id, tenantId);
    const { data: existing } = await db.from("client_passengers").select("*").eq("client_id", id).eq("tenant_id", clientTenantId);
    const byCpf = new Map<string, ClientPassengerRow>();
    const byEmail = new Map<string, ClientPassengerRow>();
    for (const p of (existing ?? []) as ClientPassengerRow[]) {
      if (p.cpf) byCpf.set(p.cpf, p);
      if (p.email) byEmail.set(p.email.toLowerCase(), p);
    }

    let created = 0;
    let updated = 0;
    let invited = 0;
    const errors: { name: string; message: string }[] = [];
    const origin = requestOrigin(request);
    for (const raw of body.rows) {
      const parsed = row.safeParse(raw);
      if (!parsed.success) {
        const nm = typeof (raw as { name?: unknown })?.name === "string" ? String((raw as { name: string }).name) : "linha sem nome";
        errors.push({ name: nm, message: "dados inválidos (nome com menos de 2 letras ou campo grande demais)" });
        continue;
      }
      const r = parsed.data;
      const cpf = normalizeCpf(r.cpf);
      const email = r.email?.trim().toLowerCase() || null;
      const match = (cpf && byCpf.get(cpf)) || (email && byEmail.get(email)) || null;
      const input = { ...r, cpf, email, active: true };
      const res = match ? await updateClientPassenger(match.id, id, clientTenantId, input) : await createClientPassenger(id, clientTenantId, input);
      if (res.error || !res.data) {
        errors.push({ name: r.name, message: res.error?.message ?? "falha" });
        continue;
      }
      if (match) updated++;
      else created++;
      if (cpf) byCpf.set(cpf, res.data);
      if (email) byEmail.set(email, res.data);
      if (body.invite && email && r.can_request !== false && !res.data.profile_id) {
        try {
          await grantPortalAccess({ passengerId: res.data.id, clientId: id, tenantId: clientTenantId, email, origin });
          invited++;
        } catch (e) {
          errors.push({ name: r.name, message: `cadastrado, mas convite não enviado: ${e instanceof Error ? e.message : "erro"}` });
        }
      }
    }
    return ok({ created, updated, invited, errors });
  } catch (error) {
    return mapApiError(error);
  }
}
