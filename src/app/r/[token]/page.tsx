import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/server/db";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { STATUS_CORRIDA_PT } from "@/lib/i18n/pt-br";

type PageProps = { params: Promise<{ token: string }> };

export default async function PublicTrackPage({ params }: PageProps) {
  const { token: raw } = await params;
  const token = decodeURIComponent(raw).trim();
  if (token.length < 16 || token.length > 200) notFound();

  const now = new Date().toISOString();
  const { data: row } = await db
    .from("trip_public_track_tokens")
    .select("trip_id, expires_at")
    .eq("token", token)
    .gt("expires_at", now)
    .maybeSingle();

  if (!row?.trip_id) notFound();

  const { data: trip } = await db
    .from("trips")
    .select("operational_status, origin_text, destination_text, passenger_name, scheduled_at")
    .eq("id", row.trip_id)
    .maybeSingle();

  if (!trip) notFound();

  const { data: loc } = await db
    .from("driver_locations")
    .select("lat, lng, recorded_at")
    .eq("trip_id", row.trip_id)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const status = trip.operational_status as TripOperationalStatus;
  const statusLabel = STATUS_CORRIDA_PT[status] ?? status;

  return (
    <div className="min-h-screen bg-slate-950 px-5 py-10 text-slate-100">
      <div className="mx-auto max-w-lg space-y-6">
        <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
        <h1 className="font-serif text-2xl text-white">Acompanhamento da corrida</h1>
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm leading-relaxed text-slate-300">
          <p>
            <span className="text-slate-500">Estado operacional:</span>{" "}
            <span className="font-medium text-amber-400">{statusLabel}</span>
          </p>
          <p className="mt-3">
            <span className="text-slate-500">Origem:</span> {trip.origin_text}
          </p>
          <p className="mt-1">
            <span className="text-slate-500">Destino:</span> {trip.destination_text}
          </p>
          {trip.passenger_name ? (
            <p className="mt-1">
              <span className="text-slate-500">Passageiro:</span> {trip.passenger_name}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-slate-500">
            Agendada:{" "}
            {new Date(trip.scheduled_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
        </div>
        {loc ? (
          <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300">
            <p className="text-xs uppercase tracking-wide text-slate-500">Última posição registrada</p>
            <p className="mt-2 font-mono text-amber-400/90">
              {Number(loc.lat).toFixed(5)}, {Number(loc.lng).toFixed(5)}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {new Date(loc.recorded_at).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Ainda não há posição GPS associada a esta corrida.</p>
        )}
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
