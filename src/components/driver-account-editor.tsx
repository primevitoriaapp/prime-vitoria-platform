"use client";

import { useCallback, useEffect, useState } from "react";

type Kind = "vehicle" | "cnh" | "pix";
type Data = {
  cnh: { number: string | null; category: string | null; expires_at: string | null };
  pix_key: string | null;
  funcionario: boolean;
  vehicle: { brand: string | null; model: string; plate: string; color: string | null; model_year: number | null; vehicle_category_id: string | null; category_name: string | null } | null;
  categories: { id: string; name: string }[];
  requests: { id: string; kind: Kind; status: "pendente" | "aprovado" | "recusado"; review_note: string | null; created_at: string; payload: Record<string, string | number | null> }[];
};

const card = "rounded-3xl border border-[#ECE7DB] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.05)]";
const field = "mt-1 w-full rounded-xl border border-[#DDD5C2] bg-white px-4 py-3 text-base text-[#111]";
const br = (ymd: string | null) => (ymd ? ymd.slice(0, 10).split("-").reverse().join("/") : "—");

function daysTo(ymd: string | null) {
  if (!ymd) return null;
  return Math.round((Date.parse(`${ymd.slice(0, 10)}T12:00:00Z`) - Date.now()) / 86400000);
}

/** Motorista atualiza veículo, CNH e PIX pelo app; a central aprova antes de valer. */
export function DriverAccountEditor() {
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = useCallback(async () => {
    const j = await fetch("/api/drivers/me/requests", { credentials: "include" }).then((r) => r.json()).catch(() => null);
    if (j?.success) setD(j.data as Data);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(kind: Kind, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const fd = new FormData(e.currentTarget);
    fd.set("kind", kind);
    const r = await fetch("/api/drivers/me/requests", { method: "POST", credentials: "include", body: fd });
    const j = (await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setBusy(false);
    if (!r.ok || !j.success) return setMsg({ ok: false, text: j.error?.message ?? "Não foi possível enviar." });
    setOpen(null);
    setMsg({ ok: true, text: "Enviado! A central vai conferir e você recebe um aviso quando for aprovado." });
    void load();
  }

  if (!d) return <div className={`${card} h-48 animate-pulse`} />;
  const pending = (k: Kind) => d.requests.find((r) => r.kind === k && r.status === "pendente");
  const lastDecided = (k: Kind) => d.requests.find((r) => r.kind === k && r.status !== "pendente");
  const cnhDays = daysTo(d.cnh.expires_at);

  const Status = ({ k }: { k: Kind }) => {
    const p = pending(k);
    if (p) return <p className="mt-2 rounded-xl bg-[#FBF3E0] px-3 py-2 text-xs text-[#8A5A00]">⏳ Alteração enviada em {new Date(p.created_at).toLocaleDateString("pt-BR")} · aguardando a central</p>;
    const l = lastDecided(k);
    if (l?.status === "recusado" && Date.now() - Date.parse(l.created_at) < 15 * 86400000)
      return <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-800">Último pedido recusado{l.review_note ? `: ${l.review_note}` : ""}</p>;
    return null;
  };
  const Head = ({ title, k, action }: { title: string; k: Kind; action: string }) => (
    <div className="flex items-center justify-between">
      <h3 className="text-base font-semibold">{title}</h3>
      {open !== k ? (
        <button type="button" className="text-sm font-semibold text-prime-gold" onClick={() => setOpen(k)}>
          {action}
        </button>
      ) : null}
    </div>
  );
  const Buttons = () => (
    <div className="flex gap-2">
      <button type="button" className="flex-1 rounded-xl border border-[#DDD5C2] px-3 py-3 text-sm" onClick={() => setOpen(null)}>
        Cancelar
      </button>
      <button type="submit" disabled={busy} className="flex-[2] rounded-xl bg-[#111] px-3 py-3 text-sm font-semibold text-prime-gold disabled:opacity-50">
        {busy ? "Enviando…" : "Enviar para a central"}
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {msg ? <p className={`rounded-2xl px-4 py-3 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}

      {/* Veículo */}
      <section className={card}>
        <Head title="Meu veículo" k="vehicle" action="Troquei de carro" />
        {d.vehicle ? (
          <div className="mt-3 flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#F6EEDC] text-2xl" aria-hidden>
              🚘
            </span>
            <div className="min-w-0">
              <p className="font-semibold">{[d.vehicle.brand, d.vehicle.model, d.vehicle.model_year].filter(Boolean).join(" ")}</p>
              <p className="text-sm text-[#8A8A8A]">{[d.vehicle.category_name, d.vehicle.color, d.vehicle.plate].filter(Boolean).join(" · ")}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-sm text-[#8A8A8A]">Nenhum carro cadastrado ainda.</p>
        )}
        <Status k="vehicle" />
        {open === "vehicle" ? (
          <form className="mt-4 grid gap-3" onSubmit={(e) => void submit("vehicle", e)}>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-[#555]">
                Marca
                <input name="brand" required className={field} placeholder="Toyota" defaultValue={d.vehicle?.brand ?? ""} />
              </label>
              <label className="text-sm text-[#555]">
                Modelo
                <input name="model" required className={field} placeholder="Corolla XEi" />
              </label>
              <label className="text-sm text-[#555]">
                Placa
                <input name="plate" required className={`${field} uppercase`} placeholder="ABC1D23" autoCapitalize="characters" />
              </label>
              <label className="text-sm text-[#555]">
                Ano
                <input name="model_year" inputMode="numeric" className={field} placeholder="2024" />
              </label>
              <label className="text-sm text-[#555]">
                Cor
                <input name="color" className={field} placeholder="Preto" />
              </label>
              <label className="text-sm text-[#555]">
                Tipo
                <select name="vehicle_category_id" className={field} defaultValue={d.vehicle?.vehicle_category_id ?? ""}>
                  <option value="">Escolher…</option>
                  {d.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="text-sm text-[#555]">
              Foto do documento do carro (CRLV)
              <input name="file" type="file" accept="image/*,application/pdf" capture="environment" required className="mt-1 block w-full text-sm" />
            </label>
            <Buttons />
          </form>
        ) : null}
      </section>

      {/* CNH */}
      <section className={card}>
        <Head title="Carteira de motorista (CNH)" k="cnh" action="Enviar CNH nova" />
        <p className="mt-2 text-sm text-[#555]">
          {d.cnh.number ? `Nº ${d.cnh.number} · categoria ${d.cnh.category ?? "—"}` : "CNH não cadastrada"}
        </p>
        {d.cnh.expires_at ? (
          <p className={`mt-1 text-sm ${cnhDays !== null && cnhDays < 0 ? "font-semibold text-red-700" : cnhDays !== null && cnhDays <= 30 ? "font-semibold text-[#8A5A00]" : "text-[#8A8A8A]"}`}>
            {cnhDays !== null && cnhDays < 0 ? `Vencida desde ${br(d.cnh.expires_at)}` : `Válida até ${br(d.cnh.expires_at)}${cnhDays !== null && cnhDays <= 30 ? ` · vence em ${cnhDays} dia(s)` : ""}`}
          </p>
        ) : null}
        <Status k="cnh" />
        {open === "cnh" ? (
          <form className="mt-4 grid gap-3" onSubmit={(e) => void submit("cnh", e)}>
            <label className="text-sm text-[#555]">
              Número da CNH (11 dígitos)
              <input name="cnh_number" required inputMode="numeric" className={field} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm text-[#555]">
                Categoria
                <input name="cnh_category" required className={`${field} uppercase`} placeholder="B, D, AD…" />
              </label>
              <label className="text-sm text-[#555]">
                Validade
                <input name="cnh_expires_at" type="date" required className={field} />
              </label>
            </div>
            <label className="text-sm text-[#555]">
              Foto da CNH nova (frente)
              <input name="file" type="file" accept="image/*,application/pdf" capture="environment" required className="mt-1 block w-full text-sm" />
            </label>
            <Buttons />
          </form>
        ) : null}
      </section>

      {/* PIX */}
      {!d.funcionario ? (
        <section className={card}>
          <Head title="Chave PIX para receber" k="pix" action="Trocar chave" />
          <p className="mt-2 text-sm text-[#555]">{d.pix_key ?? "Nenhuma chave cadastrada"}</p>
          <Status k="pix" />
          {open === "pix" ? (
            <form className="mt-4 grid gap-3" onSubmit={(e) => void submit("pix", e)}>
              <label className="text-sm text-[#555]">
                Nova chave PIX
                <input name="pix_key" required className={field} placeholder="CPF, e-mail, celular ou chave aleatória" />
              </label>
              <p className="text-xs text-[#8A8A8A]">Por segurança, a central confirma com você antes de trocar a chave onde os repasses caem.</p>
              <Buttons />
            </form>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
