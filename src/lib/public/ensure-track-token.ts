import { randomBytes } from "node:crypto";
import { db } from "@/lib/server/db";

/** Devolve um link de acompanhamento válido da corrida, criando um se não houver (vale até a corrida terminar; teto de 24 h). */
export async function ensureTripTrackToken(tripId: string): Promise<{ token: string; path: string; expires_at: string }> {
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from("trip_public_track_tokens")
    .select("token, expires_at")
    .eq("trip_id", tripId)
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.token) return { token: existing.token, path: `/r/${encodeURIComponent(existing.token)}`, expires_at: existing.expires_at };
  const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  for (let i = 0; i < 5; i++) {
    const token = randomBytes(32).toString("base64url");
    const { data, error } = await db.from("trip_public_track_tokens").insert({ trip_id: tripId, token, expires_at: expiresAt }).select("token, expires_at").single();
    if (!error && data) return { token: data.token, path: `/r/${encodeURIComponent(data.token)}`, expires_at: data.expires_at };
  }
  throw new Error("Não foi possível criar o link de acompanhamento");
}
