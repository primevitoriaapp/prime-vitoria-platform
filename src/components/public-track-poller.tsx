"use client";

import { useCallback, useEffect, useState } from "react";
import { PublicTrackMap } from "@/components/public-track-map";
import type { TripOperationalStatus } from "@/lib/domain/types";
import { isPublicTrackTerminalStatus } from "@/lib/public/track-revision";
import { shortAddress } from "@/lib/client/short-address";

export type TrackPayload = {
  operational_status: TripOperationalStatus;
  origin_text: string;
  destination_text: string;
  passenger_name: string | null;
  scheduled_at: string;
  location: { lat: number; lng: number; recorded_at: string } | null;
  origin_coords?: { lat: number; lng: number } | null;
  destination_coords?: { lat: number; lng: number } | null;
  planned_km?: number | null;
  actual_km?: number | null;
  km_updated_at?: string | null;
  driver?: { first_name: string; photo_url: string | null } | null;
  vehicle?: { label: string; color: string | null; plate: string | null } | null;
  category?: string | null;
  central_phone?: string | null;
};

const STEPS: { key: string; label: string; match: TripOperationalStatus[] }[] = [
  { key: "confirmada", label: "Confirmada", match: ["approved", "dispatched", "accepted", "reassigned"] },
  { key: "caminho", label: "A caminho", match: ["on_the_way"] },
  { key: "chegou", label: "Chegou", match: ["arrived"] },
  { key: "viagem", label: "Em viagem", match: ["in_progress"] },
  { key: "fim", label: "Concluída", match: ["completed"] }
];

function headline(s: TripOperationalStatus, driver: string | null): { title: string; sub: string } {
  const who = driver ?? "Seu motorista";
  switch (s) {
    case "on_the_way":
      return { title: `${who} está a caminho`, sub: "Acompanhe o carro no mapa até o seu embarque." };
    case "arrived":
      return { title: `${who} chegou`, sub: "O carro está no local de embarque aguardando você." };
    case "in_progress":
      return { title: "Boa viagem!", sub: "Você está a caminho do destino." };
    case "completed":
      return { title: "Viagem concluída", sub: "Obrigado por viajar com a Prime Vitória." };
    case "cancelled":
    case "rejected":
      return { title: "Corrida cancelada", sub: "Em caso de dúvida, fale com a central." };
    case "no_show":
      return { title: "Embarque não realizado", sub: "O motorista aguardou no local. Fale com a central se precisar." };
    default:
      return { title: "Sua corrida está confirmada", sub: "Você recebe a localização do carro quando o motorista sair." };
  }
}

/** A central pode ter fixo e celular ("(27) 2142-8307 | (27) 99806-3956"): usa o celular para o WhatsApp. */
const waLink = (phone: string) => {
  const parts = phone.split(/[|/,;]| e /).map((p) => p.replace(/\D/g, "")).filter((d) => d.length >= 10);
  const mobile = parts.find((d) => /^(55)?\d{2}9\d{8}$/.test(d)) ?? parts[0] ?? "";
  return `https://wa.me/${mobile.startsWith("55") ? mobile : `55${mobile}`}`;
};

export function PublicTrackPoller({ token, initial }: { token: string; initial: TrackPayload }) {
  const [data, setData] = useState<TrackPayload>(initial);
  const [ended, setEnded] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date>(new Date());
  const terminal = ended || isPublicTrackTerminalStatus(data.operational_status);

  const apply = useCallback((snap: TrackPayload) => {
    setData((prev) => ({ ...prev, ...snap }));
    setUpdatedAt(new Date());
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/track/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (res.status === 404) {
        // O link expira quando a corrida termina.
        setEnded(true);
        return;
      }
      const json = (await res.json()) as { success: boolean; data?: TrackPayload };
      if (res.ok && json.success && json.data) apply(json.data);
    } catch {
      /* tenta de novo no próximo ciclo */
    }
  }, [token, apply]);

  useEffect(() => {
    if (terminal || typeof window === "undefined" || !("EventSource" in window)) return;
    let active = true;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let source: EventSource | null = null;
    const open = () => {
      if (!active) return;
      source?.close();
      source = new EventSource(`/api/public/track/${encodeURIComponent(token)}/stream`);
      source.onmessage = (ev) => {
        try {
          const j = JSON.parse(ev.data) as { success?: boolean; data?: TrackPayload };
          if (j.success && j.data) apply(j.data);
        } catch {
          /* ignora */
        }
      };
      source.onerror = () => {
        source?.close();
        if (active) retry = setTimeout(open, 15_000);
      };
    };
    open();
    return () => {
      active = false;
      if (retry) clearTimeout(retry);
      source?.close();
    };
  }, [token, apply, terminal]);

  useEffect(() => {
    if (terminal) return;
    const id = window.setInterval(() => void refresh(), 12_000);
    return () => window.clearInterval(id);
  }, [refresh, terminal]);

  const status: TripOperationalStatus = ended && !isPublicTrackTerminalStatus(data.operational_status) ? "completed" : data.operational_status;
  const h = headline(status, data.driver?.first_name ?? null);
  const stepIdx = STEPS.findIndex((s) => s.match.includes(status));
  const showMap = !isPublicTrackTerminalStatus(status);
  const when = new Date(data.scheduled_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-3xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)]">
        <div className="p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#C9A84C]">{when}</p>
          <h1 className="mt-1 text-2xl font-semibold leading-tight text-[#111]">{h.title}</h1>
          <p className="mt-1 text-sm text-[#6B6B6B]">{h.sub}</p>

          {stepIdx >= 0 ? (
            <ol className="mt-5 grid grid-cols-5 gap-1" aria-label="Etapas da corrida">
              {STEPS.map((s, i) => (
                <li key={s.key} className="text-center">
                  <span className={`block h-1.5 rounded-full ${i <= stepIdx ? "bg-[#C9A84C]" : "bg-[#EEE9DC]"}`} />
                  <span className={`mt-1.5 block text-[10px] leading-tight sm:text-xs ${i === stepIdx ? "font-semibold text-[#111]" : "text-[#9A9A9A]"}`}>{s.label}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </div>

        {showMap ? (
          <div className="relative border-t border-[#EEE9DC]">
            <PublicTrackMap
              height="min(52vh, 420px)"
              origin={data.origin_coords ? { ...data.origin_coords, label: "Embarque" } : null}
              destination={data.destination_coords ? { ...data.destination_coords, label: "Destino" } : null}
              driver={data.location ? { lat: data.location.lat, lng: data.location.lng, label: "Motorista" } : null}
            />
            {!data.location ? (
              <p className="absolute inset-x-3 top-3 z-[500] rounded-xl bg-white/95 px-3 py-2 text-center text-xs text-[#6B6B6B] shadow">
                A posição do carro aparece aqui quando o motorista estiver a caminho.
              </p>
            ) : (
              <p className="absolute left-3 top-3 z-[500] rounded-full bg-[#111]/85 px-3 py-1 text-[11px] text-[#fff]">
                <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                ao vivo · {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </p>
            )}
          </div>
        ) : null}
      </section>

      {data.driver || data.vehicle ? (
        <section className="flex items-center gap-4 rounded-3xl bg-[#111] p-5 text-[#fff]">
          {data.driver?.photo_url && !photoFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.driver.photo_url}
              alt=""
              onError={() => setPhotoFailed(true)}
              className="h-14 w-14 shrink-0 rounded-full border-2 border-[#C9A84C] object-cover"
            />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[#C9A84C] text-xl font-semibold text-[#C9A84C]">
              {(data.driver?.first_name ?? "P").charAt(0)}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-[0.16em] text-[#fff]/60">Seu motorista</p>
            <p className="truncate text-lg font-semibold">{data.driver?.first_name ?? "Prime Vitória"}</p>
            <p className="truncate text-sm text-[#fff]/70">
              {[data.vehicle?.label, data.vehicle?.color].filter(Boolean).join(" · ") || data.category || ""}
            </p>
          </div>
          {data.vehicle?.plate ? (
            <span className="shrink-0 rounded-lg border border-[#C9A84C] px-3 py-2 text-center font-mono text-base font-bold tracking-wider text-[#C9A84C]">
              {data.vehicle.plate}
            </span>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
        <div className="flex gap-3">
          <div className="flex flex-col items-center pt-1">
            <span className="h-3 w-3 rounded-full bg-[#111]" />
            <span className="my-1 w-px flex-1 bg-[#DDD5C2]" />
            <span className="h-3 w-3 rounded-full bg-[#C9A84C]" />
          </div>
          <div className="min-w-0 flex-1 space-y-4 text-sm">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#9A9A9A]">Embarque</p>
              <p className="font-medium text-[#111]">{shortAddress(data.origin_text)}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[#9A9A9A]">Destino</p>
              <p className="font-medium text-[#111]">{shortAddress(data.destination_text)}</p>
            </div>
          </div>
        </div>
        {data.passenger_name ? <p className="mt-4 border-t border-[#EEE9DC] pt-3 text-xs text-[#6B6B6B]">Passageiro: {data.passenger_name}</p> : null}
      </section>

      {data.central_phone ? (
        <a
          href={waLink(data.central_phone)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-4 text-base font-semibold text-[#111]"
        >
          Falar com a central Prime
        </a>
      ) : null}
    </div>
  );
}
