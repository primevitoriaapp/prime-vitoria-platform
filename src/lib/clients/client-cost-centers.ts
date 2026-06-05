import { db } from "@/lib/server/db";

export type CostCenterRow = {
  id: string;
  client_id: string;
  code: string | null;
  name: string;
  responsible_name: string | null;
  responsible_email: string | null;
  active: boolean;
  tenant_id: string | null;
  created_at: string;
};

export type CostCenterInput = {
  name: string;
  code?: string | null;
  responsible_name?: string | null;
  responsible_email?: string | null;
  active?: boolean;
};

export async function listCostCenters(
  clientId: string,
  opts?: { activeOnly?: boolean }
): Promise<CostCenterRow[]> {
  let req = db.from("cost_centers").select("*").eq("client_id", clientId).order("name");
  if (opts?.activeOnly !== false) req = req.eq("active", true);
  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return (data ?? []) as CostCenterRow[];
}

export async function createCostCenter(
  clientId: string,
  tenantId: string,
  body: CostCenterInput
): Promise<{ data: CostCenterRow | null; error: Error | null }> {
  const { data, error } = await db
    .from("cost_centers")
    .insert({
      client_id: clientId,
      tenant_id: tenantId,
      name: body.name.trim(),
      code: body.code?.trim() || null,
      responsible_name: body.responsible_name?.trim() || null,
      responsible_email: body.responsible_email?.trim().toLowerCase() || null,
      active: body.active !== false
    })
    .select("*")
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as CostCenterRow, error: null };
}

export async function updateCostCenter(
  id: string,
  clientId: string,
  body: Partial<CostCenterInput>
): Promise<{ data: CostCenterRow | null; error: Error | null }> {
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.code !== undefined) patch.code = body.code?.trim() || null;
  if (body.responsible_name !== undefined) patch.responsible_name = body.responsible_name?.trim() || null;
  if (body.responsible_email !== undefined) {
    patch.responsible_email = body.responsible_email?.trim().toLowerCase() || null;
  }
  if (body.active !== undefined) patch.active = body.active;

  const { data, error } = await db
    .from("cost_centers")
    .update(patch)
    .eq("id", id)
    .eq("client_id", clientId)
    .select("*")
    .single();
  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as CostCenterRow, error: null };
}

/** Se o e-mail da sessão for responsável de um centro, devolve o id para filtrar corridas. */
export async function resolveCostCenterScopeForEmail(
  clientId: string,
  email: string | undefined
): Promise<string | null> {
  const normalized = email?.trim().toLowerCase();
  if (!normalized) return null;
  const centers = await listCostCenters(clientId, { activeOnly: true });
  const match = centers.find((c) => c.responsible_email?.trim().toLowerCase() === normalized);
  return match?.id ?? null;
}
