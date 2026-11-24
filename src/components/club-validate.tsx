"use client";

import { useEffect, useState } from "react";
import { KIND_LABEL, benefitHeadline, type BenefitKind } from "@/lib/club/club";

type Info = { status: "valido" | "expirado" | "usado" | "bloqueado" | "invalido" | "inelegivel"; name?: string; photo_url?: string | null; number?: string; expires_at?: string };
type Benefit = { id: string; title: string; kind: BenefitKind; value: number | null; rules: string | null; branch_ids: string[] | null };
type Step2 = { partner: { id: string; name: string }; benefits: Benefit[]; branches: { id: string; name: string }[] };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const num = (s: string) => (s.trim() ? Number(s.replace(/\./g, "").replace(",", ".")) : null);
const field = "w-full rounded-xl border border-[#D9D3C4] bg-white px-3 py-3 text-base";

const STATUS: Record<Info["status"], { t: string; d: string; cls: string }> = {
  valido: { t: "Carteirinha válida", d: "Motorista parceiro Prime Vitória com acesso ao clube.", cls: "bg-[#EAF6EF] text-[#1F7A4C]" },
  expirado: { t: "Código expirado", d: "Peça ao motorista para abrir a carteirinha de novo no app (o QR muda a cada 5 minutos).", cls: "bg-amber-50 text-amber-900" },
  usado: { t: "Código já utilizado", d: "Cada QR vale para um único uso. Peça ao motorista um código novo.", cls: "bg-amber-50 text-amber-900" },
  bloqueado: { t: "Código bloqueado", d: "Houve tentativas de PIN erradas. Peça um código novo ao motorista.", cls: "bg-red-50 text-red-800" },
  invalido: { t: "Código inválido", d: "Este QR não é de uma carteirinha Prime Club.", cls: "bg-red-50 text-red-800" },
  inelegivel: { t: "Sem acesso no momento", d: "Este motorista não está liberado no clube. Não aplique o desconto.", cls: "bg-red-50 text-red-800" }
};

export function ClubValidate({ code }: { code: string }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [pin, setPin] = useState("");
  const [s2, setS2] = useState<Step2 | null>(null);
  const [benefitId, setBenefitId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [purchase, setPurchase] = useState("");
  const [liters, setLiters] = useState("");
  const [saved, setSaved] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ saved: number; benefit: string; partner: string; at: string } | null>(null);

  useEffect(() => {
    void fetch(`/api/public/club/validate/${code}`)
      .then((r) => r.json())
      .then((j: { success?: boolean; data?: Info }) => setInfo(j.success && j.data ? j.data : { status: "invalido" }))
      .catch(() => setInfo({ status: "invalido" }));
  }, [code]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    const r = await fetch(`/api/public/club/validate/${code}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: unknown; error?: { message?: string } }) : {};
    setBusy(false);
    if (!r?.ok || !j.success) {
      setErr(j.error?.message ?? "Não foi possível validar. Tente de novo.");
      return null;
    }
    return j.data;
  }

  async function login() {
    if (!/^\d{4,6}$/.test(pin)) return setErr("Digite o PIN do estabelecimento (4 a 6 números).");
    const d = (await post({ pin })) as Step2 | null;
    if (d) {
      setS2(d);
      if (d.benefits.length === 1) setBenefitId(d.benefits[0].id);
      if (d.branches.length === 1) setBranchId(d.branches[0].id);
    }
  }

  const benefit = s2?.benefits.find((b) => b.id === benefitId) ?? null;
  async function register() {
    if (!benefit) return setErr("Escolha o benefício aplicado.");
    const p = num(purchase), l = num(liters), s = num(saved);
    if (benefit.kind === "percentual" && !p) return setErr("Informe o valor da compra para calcular o desconto.");
    if (benefit.kind === "por_litro" && !l) return setErr("Informe quantos litros foram abastecidos.");
    const d = (await post({ pin, benefit_id: benefit.id, branch_id: branchId || null, purchase: p, liters: l, saved: s })) as typeof done;
    if (d) setDone(d);
  }

  const preview = benefit
    ? benefit.kind === "percentual" && num(purchase)
      ? ((num(purchase) as number) * Number(benefit.value ?? 0)) / 100
      : benefit.kind === "por_litro" && num(liters)
        ? (num(liters) as number) * Number(benefit.value ?? 0)
        : benefit.kind === "valor"
          ? Number(benefit.value ?? 0)
          : num(saved)
    : null;

  return (
    <div className="min-h-dvh bg-[#F6F4EF] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-[#111]">
      <div className="mx-auto max-w-md space-y-4">
        <p className="text-center text-[13px] font-extrabold tracking-[0.14em]">
          PRIME <span className="text-[#8A6A1F]">CLUB</span>
        </p>

        {!info ? <div className="h-56 animate-pulse rounded-3xl bg-white" /> : null}

        {info ? (
          <section className="overflow-hidden rounded-3xl bg-white shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)]">
            <div className="flex items-center gap-4 bg-gradient-to-br from-[#1B1B1D] to-[#2B2A27] p-5 text-white">
              {info.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={info.photo_url} alt="" className="h-20 w-20 shrink-0 rounded-2xl border-2 border-[#C9A84C] object-cover" />
              ) : (
                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-2 border-[#C9A84C] text-3xl font-semibold text-[#D9BC6A]">{(info.name ?? "?").charAt(0)}</span>
              )}
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.14em] text-[#D9BC6A]">Motorista parceiro</p>
                <p className="truncate text-xl font-semibold" style={{ color: "#fff" }}>
                  {info.name ?? "—"}
                </p>
                <p className="text-xs text-white/70">{info.number ?? ""}</p>
              </div>
            </div>
            <div className={`px-5 py-3 ${STATUS[info.status].cls}`}>
              <p className="font-semibold">{STATUS[info.status].t}</p>
              <p className="text-sm opacity-90">{STATUS[info.status].d}</p>
            </div>
          </section>
        ) : null}

        {done ? (
          <section className="space-y-2 rounded-3xl bg-white p-5 text-center shadow-[0_10px_30px_-12px_rgba(0,0,0,0.2)]">
            <p className="text-4xl">✓</p>
            <p className="text-lg font-semibold">Benefício registrado</p>
            <p className="text-sm text-[#5C6067]">
              {done.partner} · {done.benefit}
            </p>
            <p className="text-2xl font-bold text-[#1F7A4C]">{brl(done.saved)} de economia</p>
            <p className="text-xs text-[#5C6067]">{new Date(done.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Pode aplicar o desconto.</p>
          </section>
        ) : info?.status === "valido" && !s2 ? (
          <section className="space-y-3 rounded-3xl bg-white p-5">
            <p className="font-semibold">Área do estabelecimento</p>
            <p className="text-sm text-[#5C6067]">Digite o PIN que a Prime Vitória passou para a sua loja.</p>
            <input className={`${field} text-center text-2xl tracking-[0.5em]`} inputMode="numeric" autoComplete="off" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
            {err ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
            <button type="button" disabled={busy} onClick={() => void login()} className="w-full rounded-2xl bg-[#111] px-4 py-3.5 font-semibold text-[#D9BC6A] disabled:opacity-50">
              {busy ? "Conferindo…" : "Continuar"}
            </button>
          </section>
        ) : s2 ? (
          <section className="space-y-3 rounded-3xl bg-white p-5">
            <p className="font-semibold">{s2.partner.name}</p>
            {!s2.benefits.length ? <p className="text-sm text-[#5C6067]">Nenhum benefício ativo agora. Fale com a Prime Vitória.</p> : null}
            <div className="grid gap-2">
              {s2.benefits.map((b) => (
                <button key={b.id} type="button" onClick={() => setBenefitId(b.id)} className={`rounded-2xl p-3 text-left ring-1 ${benefitId === b.id ? "bg-[#FBF6E9] ring-[#C9A84C]" : "ring-[#E5E0D4]"}`}>
                  <span className="block font-semibold">{b.title}</span>
                  <span className="block text-xs text-[#5C6067]">
                    {benefitHeadline(b)} · {KIND_LABEL[b.kind]}
                  </span>
                  {b.rules && benefitId === b.id ? <span className="mt-1 block whitespace-pre-line text-xs text-[#5C6067]">{b.rules}</span> : null}
                </button>
              ))}
            </div>
            {s2.branches.length > 1 ? (
              <label className="grid gap-1 text-sm text-[#5C6067]">
                Unidade
                <select className={field} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">Escolher…</option>
                  {s2.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {benefit ? (
              <div className="grid gap-3">
                {["percentual", "valor", "preco_exclusivo", "cupom", "gratuito", "carteirinha", "link"].includes(benefit.kind) ? (
                  <label className="grid gap-1 text-sm text-[#5C6067]">
                    Valor da compra (R$){benefit.kind === "percentual" ? "" : " — opcional"}
                    <input className={field} inputMode="decimal" value={purchase} onChange={(e) => setPurchase(e.target.value)} placeholder="0,00" />
                  </label>
                ) : null}
                {benefit.kind === "por_litro" ? (
                  <label className="grid gap-1 text-sm text-[#5C6067]">
                    Litros abastecidos
                    <input className={field} inputMode="decimal" value={liters} onChange={(e) => setLiters(e.target.value)} placeholder="0,0" />
                  </label>
                ) : null}
                {!["percentual", "valor", "por_litro"].includes(benefit.kind) ? (
                  <label className="grid gap-1 text-sm text-[#5C6067]">
                    Quanto o motorista economizou (R$)
                    <input className={field} inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} placeholder="0,00" />
                  </label>
                ) : null}
                {preview != null && preview > 0 ? <p className="rounded-xl bg-[#EAF6EF] px-3 py-2 text-sm text-[#1F7A4C]">Economia do motorista: {brl(Math.round(preview * 100) / 100)}</p> : null}
              </div>
            ) : null}
            {err ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
            <button type="button" disabled={busy || !benefit} onClick={() => void register()} className="w-full rounded-2xl bg-[#111] px-4 py-3.5 font-semibold text-[#D9BC6A] disabled:opacity-50">
              {busy ? "Registrando…" : "Confirmar e registrar uso"}
            </button>
          </section>
        ) : null}

        <p className="text-center text-xs text-[#8A8D93]">Validação segura Prime Vitória · o código muda a cada 5 minutos e vale para um único uso.</p>
      </div>
    </div>
  );
}
