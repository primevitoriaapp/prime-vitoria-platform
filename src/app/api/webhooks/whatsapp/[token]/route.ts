import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { ingestWhatsappEvent } from "@/lib/whatsapp/inbound";

export const dynamic = "force-dynamic";

type Channel = { id: string; tenant_id: string; verify_token: string; active: boolean };

async function channelFor(token: string): Promise<Channel | null> {
  if (!/^[a-f0-9]{32,80}$/.test(token)) return null;
  const { data } = await db.from("whatsapp_channels").select("id, tenant_id, verify_token, active").eq("path_token", token).maybeSingle();
  return (data as Channel | null) ?? null;
}

/**
 * Verificação da Meta: devolve só o número do desafio, em texto puro, se o token conferir.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ch = await channelFor(token);
  const u = new URL(request.url);
  const mode = u.searchParams.get("hub.mode");
  const verify = u.searchParams.get("hub.verify_token");
  const challenge = u.searchParams.get("hub.challenge") ?? "";
  if (!ch || !ch.active || mode !== "subscribe" || verify !== ch.verify_token || !/^\d{1,40}$/.test(challenge)) {
    return new NextResponse("forbidden", { status: 403, headers: { "Content-Type": "text/plain" } });
  }
  await db.from("whatsapp_channels").update({ verified_at: new Date().toISOString() }).eq("id", ch.id);
  return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

/** Eventos do WhatsApp (mensagens, status, ecos do app). Guarda e responde 200 rápido. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ch = await channelFor(token);
  if (!ch || !ch.active) return NextResponse.json({ ok: false }, { status: 404 });
  const raw = await request.text();
  if (raw.length > 1_000_000) return NextResponse.json({ ok: false }, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = { raw: raw.slice(0, 5000) };
  }
  const p = payload as { entry?: { changes?: { field?: string; value?: { messages?: unknown[]; statuses?: unknown[] } }[] }[] };
  const change = p.entry?.[0]?.changes?.[0];
  const kind = change?.value?.messages ? "message" : change?.value?.statuses ? "status" : (change?.field ?? "other");
  const { data: ev, error } = await db.from("whatsapp_inbound_events").insert({ tenant_id: ch.tenant_id, channel_id: ch.id, kind, payload }).select("id").single();
  if (error) return NextResponse.json({ ok: false }, { status: 500 }); // a Meta tenta de novo
  try {
    await ingestWhatsappEvent(ch.tenant_id, payload);
    await db.from("whatsapp_inbound_events").update({ processed_at: new Date().toISOString() }).eq("id", ev.id);
  } catch {
    // fica guardado no evento bruto e pode ser reprocessado
  }
  await db.from("whatsapp_channels").update({ last_event_at: new Date().toISOString() }).eq("id", ch.id);
  return NextResponse.json({ ok: true });
}
