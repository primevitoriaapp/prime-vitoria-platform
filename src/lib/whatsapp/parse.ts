/** Mensagem já normalizada, vinda da Meta/Dualhook (recebida, eco do app ou histórico). */
export type ChatMsg = {
  wa_id: string;
  wa_message_id: string | null;
  direction: "in" | "out";
  source: "cliente" | "app" | "plataforma" | "historico";
  type: string;
  body: string | null;
  media_id: string | null;
  ts: string;
};

type Obj = Record<string, unknown>;
const o = (x: unknown): Obj => (x && typeof x === "object" ? (x as Obj) : {});
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const tsIso = (t: unknown) => {
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return new Date().toISOString();
  return new Date(n > 1e12 ? n : n * 1000).toISOString();
};
export const digitsOnly = (s: unknown) => String(s ?? "").replace(/\D/g, "");

const LABEL: Record<string, string> = {
  image: "📷 Foto",
  video: "🎥 Vídeo",
  audio: "🎤 Áudio",
  voice: "🎤 Áudio",
  document: "📄 Documento",
  sticker: "Figurinha",
  location: "📍 Localização",
  contacts: "👤 Contato",
  reaction: "Reação",
  errors: "Mensagem não suportada",
  unsupported: "Mensagem não suportada"
};

/** Texto que aparece na conversa para qualquer tipo de mensagem. */
export function messageText(m: Obj): { type: string; body: string | null; media_id: string | null } {
  const type = String(m.type ?? "text");
  if (type === "text") return { type, body: String(o(m.text).body ?? ""), media_id: null };
  if (type === "button") return { type, body: String(o(m.button).text ?? ""), media_id: null };
  if (type === "interactive") {
    const i = o(m.interactive);
    const r = o(i.button_reply ?? i.list_reply);
    return { type, body: String(r.title ?? "Resposta"), media_id: null };
  }
  if (type === "reaction") return { type, body: `Reagiu ${String(o(m.reaction).emoji ?? "")}`.trim(), media_id: null };
  if (type === "location") {
    const l = o(m.location);
    const name = [l.name, l.address].filter(Boolean).join(" · ");
    return { type, body: `📍 ${name || `${l.latitude}, ${l.longitude}`}`, media_id: null };
  }
  const media = o(m[type]);
  if (media.id) {
    const cap = media.caption ? ` · ${String(media.caption)}` : media.filename ? ` · ${String(media.filename)}` : "";
    return { type, body: `${LABEL[type] ?? type}${cap}`, media_id: String(media.id) };
  }
  if (type === "template") return { type, body: "Modelo de mensagem", media_id: null };
  return { type, body: LABEL[type] ?? type, media_id: null };
}

/** Lê um evento do webhook e devolve mensagens, contatos e status de entrega. */
export function parseWebhook(payload: unknown): {
  messages: ChatMsg[];
  contacts: { wa_id: string; name: string | null; profile_name: string | null }[];
  statuses: { id: string; status: string; error: string | null }[];
} {
  const messages: ChatMsg[] = [];
  const contacts: { wa_id: string; name: string | null; profile_name: string | null }[] = [];
  const statuses: { id: string; status: string; error: string | null }[] = [];
  for (const e of arr(o(payload).entry)) {
    for (const ch of arr(o(e).changes)) {
      const field = String(o(ch).field ?? "");
      const v = o(o(ch).value);
      for (const c of arr(v.contacts)) {
        const cc = o(c);
        const wa = digitsOnly(cc.wa_id);
        if (wa) contacts.push({ wa_id: wa, name: null, profile_name: (o(cc.profile).name as string) ?? null });
      }
      for (const m of arr(v.messages)) {
        const mm = o(m);
        const wa = digitsOnly(mm.from);
        if (!wa) continue;
        messages.push({ wa_id: wa, wa_message_id: (mm.id as string) ?? null, direction: "in", source: "cliente", ts: tsIso(mm.timestamp), ...messageText(mm) });
      }
      // Mensagens enviadas pelo app WhatsApp Business (coexistência).
      for (const m of arr(v.message_echoes)) {
        const mm = o(m);
        const wa = digitsOnly(mm.to);
        if (!wa) continue;
        messages.push({ wa_id: wa, wa_message_id: (mm.id as string) ?? null, direction: "out", source: "app", ts: tsIso(mm.timestamp), ...messageText(mm) });
      }
      for (const s of arr(v.statuses)) {
        const ss = o(s);
        if (ss.id) statuses.push({ id: String(ss.id), status: String(ss.status ?? ""), error: arr(ss.errors).length ? String(o(arr(ss.errors)[0]).title ?? "erro") : null });
      }
      // Contatos da agenda do app.
      for (const s of arr(v.state_sync)) {
        const ss = o(s);
        const c = o(ss.contact);
        const wa = digitsOnly(c.phone_number);
        if (wa && ss.type === "contact" && ss.action !== "remove") contacts.push({ wa_id: wa, name: (c.full_name as string) ?? (c.first_name as string) ?? null, profile_name: null });
      }
      // Histórico (até 6 meses) compartilhado na conexão.
      if (field === "history") {
        for (const h of arr(v.history)) {
          for (const th of arr(o(h).threads)) {
            const t = o(th);
            const wa = digitsOnly(t.id ?? o(t.context).wa_id);
            if (!wa) continue;
            for (const m of arr(t.messages)) {
              const mm = o(m);
              if (mm.type === "errors") continue;
              const fromMe = digitsOnly(mm.from) !== wa;
              messages.push({
                wa_id: wa,
                wa_message_id: (mm.id as string) ?? null,
                direction: fromMe ? "out" : "in",
                source: "historico",
                ts: tsIso(mm.timestamp),
                ...messageText(mm)
              });
            }
          }
        }
      }
    }
  }
  return { messages, contacts, statuses };
}

