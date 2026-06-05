import { db } from "@/lib/server/db";

export type ClientPassengerRow = {
  id: string;
  client_id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  address: string | null;
  matricula: string | null;
  sector: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ClientPassengerInput = {
  name: string;
  phone?: string | null;
  address?: string | null;
  matricula?: string | null;
  sector?: string | null;
  active?: boolean;
};

export async function listClientPassengers(
  clientId: string,
  tenantId: string,
  opts?: { q?: string; activeOnly?: boolean }
): Promise<ClientPassengerRow[]> {
  let req = db
    .from("client_passengers")
    .select("*")
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .order("name");

  if (opts?.activeOnly !== false) req = req.eq("active", true);
  const { data, error } = await req;
  if (error) throw new Error(error.message);

  let rows = (data ?? []) as ClientPassengerRow[];
  const q = opts?.q?.trim().toLowerCase();
  if (q) {
    rows = rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.phone ?? "").includes(q) ||
        (r.matricula ?? "").toLowerCase().includes(q)
    );
  }
  return rows;
}

export async function createClientPassenger(
  clientId: string,
  tenantId: string,
  body: ClientPassengerInput
): Promise<{ data: ClientPassengerRow | null; error: Error | null }> {
  const { data, error } = await db
    .from("client_passengers")
    .insert({
      client_id: clientId,
      tenant_id: tenantId,
      name: body.name.trim(),
      phone: body.phone?.trim() || null,
      address: body.address?.trim() || null,
      matricula: body.matricula?.trim() || null,
      sector: body.sector?.trim() || null,
      active: body.active !== false,
      updated_at: new Date().toISOString()
    })
    .select("*")
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as ClientPassengerRow, error: null };
}

export async function updateClientPassenger(
  passengerId: string,
  clientId: string,
  tenantId: string,
  body: Partial<ClientPassengerInput>
): Promise<{ data: ClientPassengerRow | null; error: Error | null }> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.phone !== undefined) patch.phone = body.phone?.trim() || null;
  if (body.address !== undefined) patch.address = body.address?.trim() || null;
  if (body.matricula !== undefined) patch.matricula = body.matricula?.trim() || null;
  if (body.sector !== undefined) patch.sector = body.sector?.trim() || null;
  if (body.active !== undefined) patch.active = body.active;

  const { data, error } = await db
    .from("client_passengers")
    .update(patch)
    .eq("id", passengerId)
    .eq("client_id", clientId)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();

  if (error) return { data: null, error: new Error(error.message) };
  return { data: data as ClientPassengerRow, error: null };
}
