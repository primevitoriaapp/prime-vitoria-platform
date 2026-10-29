import { fail, mapApiError, ok } from "@/lib/server/http";
import { loadTripForActor } from "@/lib/trips/trip-actor";
import { ensureTripTrackToken } from "@/lib/public/ensure-track-token";
import { publicAppUrl } from "@/lib/messages/trip-message-context";

const LIVE = ["on_the_way", "arrived", "in_progress"];

function waPhone(raw: string | null | undefined): string | null {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return d.startsWith("55") && d.length >= 12 ? d : `55${d}`;
}

/** Link de acompanhamento para o motorista mandar ao passageiro pelo WhatsApp (só enquanto a corrida está em andamento). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const r = await loadTripForActor(id, "operational_status, passenger_name, passenger_phone");
    if (!r.ok) return fail(r.error === "notfound" ? "TRIP_NOT_FOUND" : "FORBIDDEN", "Sem acesso a esta corrida", r.error === "notfound" ? 404 : 403);
    const t = r.trip;
    if (!LIVE.includes(String(t.operational_status))) return ok({ available: false });
    const tok = await ensureTripTrackToken(id);
    const url = `${publicAppUrl()}${tok.path}`;
    const first = String(t.passenger_name ?? "").trim().split(/\s+/)[0];
    const message = `Olá${first ? `, ${first}` : ""}! Aqui é o motorista da Prime Vitória. Estou a caminho do seu embarque. Acompanhe em tempo real pelo link: ${url}`;
    const phone = waPhone(t.passenger_phone as string | null);
    return ok({
      available: true,
      url,
      phone,
      whatsapp_url: `https://wa.me/${phone ?? ""}?text=${encodeURIComponent(message)}`,
      expires_at: tok.expires_at
    });
  } catch (error) {
    return mapApiError(error);
  }
}
