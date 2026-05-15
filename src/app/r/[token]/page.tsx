import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicTrackPoller } from "@/components/public-track-poller";
import { normalizePublicTrackToken } from "@/lib/public/track-token";
import { resolvePublicTrackSnapshot } from "@/lib/public/resolve-public-track";

type PageProps = { params: Promise<{ token: string }> };

export default async function PublicTrackPage({ params }: PageProps) {
  const { token: raw } = await params;
  if (!normalizePublicTrackToken(raw)) notFound();

  const snapshot = await resolvePublicTrackSnapshot(raw);
  if (!snapshot) notFound();

  const initial = {
    operational_status: snapshot.operational_status,
    origin_text: snapshot.origin_text,
    destination_text: snapshot.destination_text,
    passenger_name: snapshot.passenger_name,
    scheduled_at: snapshot.scheduled_at,
    location: snapshot.location,
    origin_coords: snapshot.origin_coords,
    destination_coords: snapshot.destination_coords,
    planned_km: snapshot.planned_km,
    actual_km: snapshot.actual_km
  };

  return (
    <div className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <div className="mx-auto max-w-lg space-y-6">
        <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
        <h1 className="font-serif text-2xl text-white">Acompanhamento da corrida</h1>
        <PublicTrackPoller token={normalizePublicTrackToken(raw)!} initial={initial} />
        <p className="text-xs text-slate-600">
          Este link é privado. Se não reconhece o envio, ignore esta página.
        </p>
        <Link href="/" className="inline-block text-sm text-amber-500 hover:text-amber-400">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
