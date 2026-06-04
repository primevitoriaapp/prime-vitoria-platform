import { ClientTripDetailPanel } from "@/components/client-trip-detail-panel";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { db } from "@/lib/server/db";
import { getSessionContext } from "@/lib/server/session";
import Link from "next/link";
import { z } from "zod";

export default async function ClientTripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionContext();
  const { id } = await params;
  const valid = z.string().uuid().safeParse(id);
  const isCliente = session.role === "cliente" && Boolean(session.clientId);
  const isAdmin = session.role === "admin";

  if (!isCliente && !isAdmin) {
    return (
      <div className="min-h-screen bg-slate-950 px-5 py-16 text-slate-100">
        <Link href="/login?next=/client" className="text-amber-400 hover:underline">
          Entrar no portal
        </Link>
      </div>
    );
  }

  if (!valid.success) {
    return (
      <div className="min-h-screen bg-slate-950 px-5 py-16 text-slate-100">
        <p className="text-red-300">Identificador de corrida inválido.</p>
        <Link href="/client" className="mt-4 inline-block text-amber-400">
          Voltar
        </Link>
      </div>
    );
  }

  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  let costCenters: { id: string; code: string | null; name: string }[] = [];

  if (isCliente && session.clientId) {
    try {
      const { data: cc } = await db
        .from("cost_centers")
        .select("id, code, name")
        .eq("client_id", session.clientId)
        .eq("tenant_id", tenantId)
        .order("name")
        .limit(50);
      costCenters = cc ?? [];
    } catch {
      /* API-only fallback */
    }
  }

  return (
    <ClientTripDetailPanel
      tripId={id}
      costCenters={costCenters}
      devFallbackRole={isAdmin ? "admin" : "cliente"}
    />
  );
}
