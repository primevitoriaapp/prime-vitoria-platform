import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertTenantScope } from "@/lib/server/tenant-scope";
import { knownPeopleFromTrips, type KnownPerson } from "@/lib/clients/known-people";

/** Funcionários cadastrados + quem já viajou nas corridas deste cliente (para o cadastro da corrida preencher sozinho). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionContext();
    if (!["admin", "operador"].includes(session.role)) return fail("FORBIDDEN", "Sem permissão", 403);
    const tenantId = assertTenantScope(session);
    const { id } = await params;
    const [{ data: roster }, { data: trips }] = await Promise.all([
      db.from("client_passengers").select("name, phone, address").eq("client_id", id).eq("tenant_id", tenantId).eq("active", true).limit(500),
      db
        .from("trips")
        .select("trip_dropoff_stops, trip_pickup_stops, origin_text, destination_text")
        .eq("client_id", id)
        .eq("tenant_id", tenantId)
        .order("scheduled_at", { ascending: false })
        .limit(200)
    ]);
    // Endereço que se repete como origem/destino em quase todas as corridas é o do próprio cliente (ex.: o TRT): não serve de casa.
    const freq = new Map<string, number>();
    for (const t of trips ?? []) for (const a of [t.origin_text, t.destination_text]) if (a) freq.set(String(a), (freq.get(String(a)) ?? 0) + 1);
    const total = (trips ?? []).length;
    const clientPlaces = [...freq.entries()].filter(([, n]) => total >= 3 && n >= total * 0.5).map(([a]) => a);

    const fromTrips = knownPeopleFromTrips(trips ?? [], clientPlaces);
    const out: KnownPerson[] = [];
    const seen = new Set<string>();
    for (const r of roster ?? []) {
      const hist = fromTrips.find((p) => p.name.trim().toLowerCase() === String(r.name).trim().toLowerCase());
      out.push({
        name: String(r.name),
        address: String(r.address ?? hist?.address ?? ""),
        lat: r.address ? null : (hist?.lat ?? null),
        lng: r.address ? null : (hist?.lng ?? null),
        phone: (r.phone as string | null) ?? hist?.phone ?? null,
        source: "cadastro"
      });
      seen.add(String(r.name).trim().toLowerCase());
    }
    for (const p of fromTrips) if (!seen.has(p.name.trim().toLowerCase())) out.push(p);
    out.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    return ok(out);
  } catch (e) {
    return mapApiError(e);
  }
}
