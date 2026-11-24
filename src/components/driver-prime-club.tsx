"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BodyPortal } from "@/components/ui/body-portal";
import { CATEGORY_ICONS, benefitHeadline, type BenefitKind } from "@/lib/club/club";
import { qrSvgPath } from "@/lib/qr/qr-encode";

type Benefit = {
  id: string;
  partner_id: string;
  branch_ids: string[] | null;
  title: string;
  description: string | null;
  kind: BenefitKind;
  value: number | null;
  coupon_code: string | null;
  external_url: string | null;
  rules: string | null;
  valid_until: string | null;
  featured: boolean;
};
type Branch = { id: string; name: string; address: string | null; city: string | null; uf: string | null; lat: number | null; lng: number | null; hours: string | null; phone: string | null; whatsapp: string | null };
type Partner = {
  id: string;
  name: string;
  category_id: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  instagram: string | null;
  featured: boolean;
  branches: Branch[];
  benefits: Benefit[];
};
type Use = { id: string; created_at: string; partner: string; partner_id: string; saved_amount: number | null; purchase_amount: number | null; status: string; rating: number | null };
type Club = {
  member: { name: string; full_name: string; photo_url: string | null; number: string; eligible: boolean; reason: string | null };
  categories: { id: string; name: string; icon: string }[];
  partners: Partner[];
  favorites: string[];
  history: Use[];
  saved_total: number;
  saved_month: number;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const GOLD = "#B08D35";
const digits = (s: string | null) => (s ?? "").replace(/\D/g, "");
const wa = (s: string | null) => {
  const d = digits(s);
  return d ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : null;
};
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371, r = Math.PI / 180;
  const x = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function Icon({ d, size = 22, color = "currentColor", w = 1.8 }: { d: string; size?: number; color?: string; w?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}
const I = {
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z",
  pin: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  heart: CATEGORY_ICONS.heart,
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  chat: "M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z",
  nav: "M3 11l18-8-8 18-2-8z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  plus: "M12 5v14M5 12h14",
  back: "M15 18l-6-6 6-6"
};

export function DriverPrimeClub() {
  const [club, setClub] = useState<Club | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<"explorar" | "favoritos" | "historico">("explorar");
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [open, setOpen] = useState<Partner | null>(null);
  const [qr, setQr] = useState(false);
  const [suggest, setSuggest] = useState(false);
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/club/me", { credentials: "include" }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: Club; error?: { message?: string } }) : {};
    if (j.success && j.data) setClub(j.data);
    else setErr(j.error?.message ?? "Não foi possível abrir o Prime Club.");
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  function near() {
    if (!navigator.geolocation) return setLocMsg("Seu celular não liberou a localização.");
    setLocMsg("Buscando sua localização…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setHere({ lat: p.coords.latitude, lng: p.coords.longitude });
        setLocMsg(null);
      },
      () => setLocMsg("Permita a localização para ver os mais próximos."),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }

  const dist = useCallback(
    (p: Partner) => {
      if (!here) return null;
      const ds = p.branches.filter((b) => b.lat != null && b.lng != null).map((b) => km(here, { lat: Number(b.lat), lng: Number(b.lng) }));
      return ds.length ? Math.min(...ds) : null;
    },
    [here]
  );

  const list = useMemo(() => {
    if (!club) return [];
    const t = q.trim().toLowerCase();
    const catName = (id: string | null) => club.categories.find((c) => c.id === id)?.name ?? "";
    let out = club.partners.filter((p) => {
      if (cat && p.category_id !== cat) return false;
      if (view === "favoritos" && !club.favorites.includes(p.id)) return false;
      if (!t) return true;
      const hay = [p.name, p.description, catName(p.category_id), ...p.branches.flatMap((b) => [b.city, b.address, b.name]), ...p.benefits.map((b) => b.title)].join(" ").toLowerCase();
      return hay.includes(t);
    });
    if (here) out = [...out].sort((a, b) => (dist(a) ?? 9999) - (dist(b) ?? 9999));
    return out;
  }, [club, q, cat, view, here, dist]);

  async function toggleFav(p: Partner) {
    if (!club) return;
    const on = !club.favorites.includes(p.id);
    setClub({ ...club, favorites: on ? [...club.favorites, p.id] : club.favorites.filter((x) => x !== p.id) });
    await fetch("/api/club/favorite", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ partner_id: p.id, on }) }).catch(() => undefined);
  }

  if (err) return <p className="rounded-3xl bg-white p-5 text-sm text-[#6B6F76]">{err}</p>;
  if (!club) return <div className="h-52 animate-pulse rounded-3xl bg-white" />;

  const featured = club.partners.filter((p) => p.featured || p.benefits.some((b) => b.featured));
  const showDiscover = view === "explorar" && !q.trim() && !cat;

  return (
    <div className="space-y-5">
      {/* Carteirinha */}
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1C1C1E] via-[#26251F] to-[#3A3220] p-5 text-white shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)]">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-[#C9A84C]/20 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <p className="text-[12px] font-extrabold tracking-[0.18em]">
            PRIME <span className="text-[#D9BC6A]">CLUB</span>
          </p>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${club.member.eligible ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"}`}>
            {club.member.eligible ? "● Ativo" : "● Suspenso"}
          </span>
        </div>
        <div className="relative mt-4 flex items-center gap-4">
          {club.member.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={club.member.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl border-2 border-[#C9A84C] object-cover" />
          ) : (
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-[#C9A84C] text-2xl font-semibold text-[#D9BC6A]">{club.member.name.charAt(0)}</span>
          )}
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold" style={{ color: "#fff" }}>
              {club.member.full_name}
            </p>
            <p className="text-xs text-white/60">Motorista parceiro · {club.member.number}</p>
          </div>
        </div>
        {club.member.eligible ? (
          <button type="button" onClick={() => setQr(true)} className="relative mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C9A84C] px-4 py-3.5 font-semibold text-[#111]">
            <Icon d={I.qr} size={20} color="#111" /> Mostrar QR para o estabelecimento
          </button>
        ) : (
          <p className="relative mt-4 rounded-2xl bg-white/10 px-3 py-2.5 text-sm text-white/80">{club.member.reason}</p>
        )}
      </section>

      {/* Economia */}
      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-white p-4">
          <p className="text-xs text-[#6B6F76]">Economia no mês</p>
          <p className="mt-1 text-xl font-bold text-[#1F7A4C]">{brl(club.saved_month)}</p>
        </div>
        <div className="rounded-3xl bg-white p-4">
          <p className="text-xs text-[#6B6F76]">Economia total</p>
          <p className="mt-1 text-xl font-bold">{brl(club.saved_total)}</p>
        </div>
      </section>

      {/* Abas internas */}
      <div className="grid grid-cols-3 rounded-2xl bg-white p-1 text-sm">
        {(
          [
            ["explorar", "Explorar"],
            ["favoritos", "Favoritos"],
            ["historico", "Histórico"]
          ] as const
        ).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setView(k)} className={`rounded-xl py-2.5 ${view === k ? "bg-[#111] font-semibold text-[#D9BC6A]" : "text-[#6B6F76]"}`}>
            {t}
          </button>
        ))}
      </div>

      {view === "historico" ? (
        <History uses={club.history} reload={load} />
      ) : (
        <>
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl bg-white px-3 ring-1 ring-[#ECE7DB]">
              <Icon d={I.search} size={18} color="#8A8D93" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar loja, serviço ou cidade" className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none" />
            </label>
            <button type="button" onClick={near} aria-label="Perto de mim" className={`flex shrink-0 items-center gap-1 rounded-2xl px-3 text-sm font-semibold ring-1 ${here ? "bg-[#111] text-[#D9BC6A] ring-[#111]" : "bg-white ring-[#ECE7DB]"}`}>
              <Icon d={I.pin} size={18} color={here ? "#D9BC6A" : GOLD} /> Perto
            </button>
          </div>
          {locMsg ? <p className="-mt-3 text-xs text-[#6B6F76]">{locMsg}</p> : null}

          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
            {club.categories.map((c) => (
              <button key={c.id} type="button" onClick={() => setCat(cat === c.id ? null : c.id)} className="flex w-[76px] shrink-0 flex-col items-center gap-1.5">
                <span className={`flex h-14 w-14 items-center justify-center rounded-2xl ${cat === c.id ? "bg-[#111]" : "bg-white ring-1 ring-[#ECE7DB]"}`}>
                  <Icon d={CATEGORY_ICONS[c.icon] ?? CATEGORY_ICONS.tag} color={cat === c.id ? "#D9BC6A" : GOLD} />
                </span>
                <span className={`line-clamp-2 text-center text-[11px] leading-tight ${cat === c.id ? "font-semibold" : "text-[#4B4F56]"}`}>{c.name}</span>
              </button>
            ))}
          </div>

          {showDiscover && featured.length ? (
            <section className="space-y-2">
              <h3 className="text-base font-bold">Em destaque</h3>
              <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
                {featured.map((p) => (
                  <button key={p.id} type="button" onClick={() => setOpen(p)} className="w-[260px] shrink-0 snap-start overflow-hidden rounded-3xl bg-white text-left">
                    <span className="relative block h-28 bg-gradient-to-br from-[#2A2925] to-[#4A3F27]">
                      {p.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.cover_url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                      {p.benefits[0] ? <span className="absolute left-3 top-3 rounded-full bg-[#C9A84C] px-2.5 py-1 text-xs font-bold text-[#111]">{benefitHeadline(p.benefits[0])}</span> : null}
                    </span>
                    <span className="block p-3">
                      <span className="block truncate font-semibold">{p.name}</span>
                      <span className="block truncate text-xs text-[#6B6F76]">{p.benefits[0]?.title ?? ""}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-2">
            <h3 className="text-base font-bold">{view === "favoritos" ? "Seus favoritos" : here ? "Mais perto de você" : cat ? (club.categories.find((c) => c.id === cat)?.name ?? "Estabelecimentos") : "Estabelecimentos"}</h3>
            {!list.length ? (
              <div className="rounded-3xl bg-white p-6 text-center text-sm text-[#6B6F76]">
                {club.partners.length === 0
                  ? "Os primeiros parceiros estão chegando. Você será avisado quando estiverem disponíveis."
                  : view === "favoritos"
                    ? "Toque no coração de um estabelecimento para salvar aqui."
                    : "Nada encontrado com esse filtro."}
              </div>
            ) : (
              <ul className="space-y-2">
                {list.map((p) => {
                  const d = dist(p);
                  const fav = club.favorites.includes(p.id);
                  return (
                    <li key={p.id} className="flex items-center gap-3 rounded-3xl bg-white p-3">
                      <button type="button" onClick={() => setOpen(p)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[#F6F2E8]">
                          {p.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.logo_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <Icon d={CATEGORY_ICONS[club.categories.find((c) => c.id === p.category_id)?.icon ?? "tag"] ?? CATEGORY_ICONS.tag} color={GOLD} />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{p.name}</span>
                          <span className="block truncate text-sm font-semibold text-[#1F7A4C]">{p.benefits[0] ? benefitHeadline(p.benefits[0]) : "Benefício exclusivo"}</span>
                          <span className="block truncate text-xs text-[#6B6F76]">
                            {[p.branches[0]?.city, d != null ? `${d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`}` : null, p.branches.length > 1 ? `${p.branches.length} unidades` : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                      <button type="button" onClick={() => void toggleFav(p)} aria-label={fav ? "Remover dos favoritos" : "Favoritar"} className="shrink-0 p-2">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill={fav ? "#C9A84C" : "none"} stroke={fav ? "#C9A84C" : "#9A9DA3"} strokeWidth="1.8" aria-hidden>
                          <path d={I.heart} />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <button type="button" onClick={() => setSuggest(true)} className="flex w-full items-center gap-3 rounded-3xl border border-dashed border-[#C9A84C] bg-[#FBF7EC] p-4 text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#111]">
              <Icon d={I.plus} size={18} color="#D9BC6A" />
            </span>
            <span>
              <span className="block font-semibold">Indicar um estabelecimento</span>
              <span className="block text-xs text-[#6B6F76]">Conhece um lugar que deveria estar no clube? A Prime vai atrás.</span>
            </span>
          </button>
        </>
      )}

      {open ? <PartnerSheet p={open} fav={club.favorites.includes(open.id)} onFav={() => void toggleFav(open)} eligible={club.member.eligible} onQr={() => setQr(true)} onClose={() => setOpen(null)} /> : null}
      {qr ? <QrSheet name={club.member.full_name} photo={club.member.photo_url} number={club.member.number} onClose={() => setQr(false)} /> : null}
      {suggest ? <SuggestSheet onClose={() => setSuggest(false)} /> : null}
    </div>
  );
}

/* ------------------------------ QR dinâmico ------------------------------ */
function QrSheet({ name, photo, number, onClose }: { name: string; photo: string | null; number: string; onClose: () => void }) {
  const [tok, setTok] = useState<{ code: string; url: string; expires_at: string } | null>(null);
  const [left, setLeft] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);

  const fresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    const r = await fetch("/api/club/token", { method: "POST", credentials: "include" }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: { code: string; url: string; expires_at: string }; error?: { message?: string } }) : {};
    busy.current = false;
    if (j.success && j.data) {
      setTok(j.data);
      setErr(null);
    } else setErr(j.error?.message ?? "Sem conexão. Tente de novo.");
  }, []);

  useEffect(() => {
    void fresh();
  }, [fresh]);
  useEffect(() => {
    const t = setInterval(() => {
      if (!tok) return;
      const s = Math.max(0, Math.round((new Date(tok.expires_at).getTime() - Date.now()) / 1000));
      setLeft(s);
      if (s <= 15) void fresh(); // troca antes de vencer
    }, 1000);
    return () => clearInterval(t);
  }, [tok, fresh]);

  const svg = useMemo(() => (tok ? qrSvgPath(tok.url) : null), [tok]);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[130] flex flex-col bg-[#F6F4EF] pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mx-auto flex w-full max-w-md items-center justify-between px-4">
          <p className="text-[13px] font-extrabold tracking-[0.14em]">
            PRIME <span className="text-[#8A6A1F]">CLUB</span>
          </p>
          <button type="button" onClick={onClose} className="rounded-full bg-white px-4 py-2 text-sm font-semibold ring-1 ring-[#ECE7DB]">
            Fechar
          </button>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 text-center">
          <div className="flex items-center gap-3">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="" className="h-12 w-12 rounded-xl border-2 border-[#C9A84C] object-cover" />
            ) : null}
            <div className="text-left">
              <p className="font-semibold">{name}</p>
              <p className="text-xs text-[#6B6F76]">{number}</p>
            </div>
          </div>
          <div className="w-full max-w-[300px] rounded-3xl bg-white p-4 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.3)]">
            {svg ? (
              <svg viewBox={`0 0 ${svg.size} ${svg.size}`} className="block h-auto w-full" shapeRendering="crispEdges" role="img" aria-label="QR Code da carteirinha">
                <rect width={svg.size} height={svg.size} fill="#fff" />
                <path d={svg.path} fill="#111" />
              </svg>
            ) : (
              <div className="aspect-square w-full animate-pulse rounded-2xl bg-[#F1EDE3]" />
            )}
          </div>
          {tok ? <p className="font-mono text-lg font-bold tracking-[0.25em]">{tok.code}</p> : null}
          <p className="text-sm text-[#6B6F76]">
            {err ?? (tok ? `Mostre ao atendente. O código se renova sozinho (${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}).` : "Gerando código seguro…")}
          </p>
          <p className="text-xs text-[#8A8D93]">Seu CPF e telefone não aparecem para o estabelecimento.</p>
        </div>
      </div>
    </BodyPortal>
  );
}

/* --------------------------- Página do parceiro --------------------------- */
function contactActions(p: Partner): { t: string; d: string; href: string }[] {
  const out: { t: string; d: string; href: string }[] = [];
  const phone = p.phone || p.branches[0]?.phone || null;
  if (phone) out.push({ t: "Ligar", d: I.phone, href: `tel:${digits(phone)}` });
  const w = wa(p.whatsapp || p.branches[0]?.whatsapp || null);
  if (w) out.push({ t: "WhatsApp", d: I.chat, href: w });
  if (p.website) out.push({ t: "Site", d: I.link, href: p.website.startsWith("http") ? p.website : `https://${p.website}` });
  if (p.instagram) out.push({ t: "Instagram", d: "M4 4h16v16H4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 7h.01", href: `https://instagram.com/${p.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}` });
  return out;
}

function PartnerSheet({ p, fav, onFav, eligible, onQr, onClose }: { p: Partner; fav: boolean; onFav: () => void; eligible: boolean; onQr: () => void; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[120] flex flex-col bg-[#F6F4EF]">
        <div className="relative h-48 shrink-0 bg-gradient-to-br from-[#1C1C1E] to-[#4A3F27]">
          {p.cover_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.cover_url} alt="" className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute inset-x-0 top-0 flex justify-between px-4 pt-[max(0.9rem,env(safe-area-inset-top))]">
            <button type="button" onClick={onClose} aria-label="Voltar" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow">
              <Icon d={I.back} size={20} color="#111" />
            </button>
            <button type="button" onClick={onFav} aria-label="Favoritar" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/95 shadow">
              <svg width="20" height="20" viewBox="0 0 24 24" fill={fav ? "#C9A84C" : "none"} stroke={fav ? "#C9A84C" : "#111"} strokeWidth="1.8" aria-hidden>
                <path d={I.heart} />
              </svg>
            </button>
          </div>
        </div>
        <div className="-mt-8 flex-1 overflow-y-auto overscroll-contain rounded-t-[28px] bg-[#F6F4EF] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <div className="mx-auto max-w-lg space-y-4">
            <div className="flex items-center gap-3">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-[#ECE7DB]">
                {p.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.logo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-[#B08D35]">{p.name.charAt(0)}</span>
                )}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-xl font-bold" style={{ color: "#111" }}>
                  {p.name}
                </h2>
                <p className="text-xs text-[#6B6F76]">{p.branches.length > 1 ? `${p.branches.length} unidades` : (p.branches[0]?.city ?? "")}</p>
              </div>
            </div>
            {p.description ? <p className="whitespace-pre-line text-sm text-[#4B4F56]">{p.description}</p> : null}

            <div className="grid grid-cols-4 gap-2 text-xs">
              {contactActions(p).map((a) => (
                <a key={a.t} href={a.href} target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-1 rounded-2xl bg-white py-3">
                  <Icon d={a.d} size={20} color={GOLD} />
                  {a.t}
                </a>
              ))}
            </div>

            <section className="space-y-2">
              <h3 className="font-bold">Benefícios</h3>
              {p.benefits.map((b) => (
                <div key={b.id} className="space-y-2 rounded-3xl bg-white p-4">
                  <span className="inline-block rounded-full bg-[#FBF2DA] px-2.5 py-1 text-xs font-bold text-[#7A5C16]">{benefitHeadline(b)}</span>
                  <p className="font-semibold">{b.title}</p>
                  {b.description ? <p className="whitespace-pre-line text-sm text-[#4B4F56]">{b.description}</p> : null}
                  {b.rules ? <p className="whitespace-pre-line rounded-xl bg-[#F6F4EF] p-2.5 text-xs text-[#6B6F76]">{b.rules}</p> : null}
                  {b.valid_until ? <p className="text-xs text-[#6B6F76]">Válido até {b.valid_until.split("-").reverse().join("/")}</p> : null}
                  {b.branch_ids?.length ? <p className="text-xs text-[#6B6F76]">Vale em: {p.branches.filter((x) => b.branch_ids?.includes(x.id)).map((x) => x.name).join(", ")}</p> : null}
                  {b.kind === "cupom" && b.coupon_code ? (
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard?.writeText(b.coupon_code ?? "");
                        setCopied(b.id);
                      }}
                      className="flex w-full items-center justify-between rounded-2xl border-2 border-dashed border-[#C9A84C] px-4 py-3"
                    >
                      <span className="font-mono text-lg font-bold tracking-widest">{b.coupon_code}</span>
                      <span className="text-sm font-semibold text-[#8A6A1F]">{copied === b.id ? "Copiado ✓" : "Copiar"}</span>
                    </button>
                  ) : b.kind === "link" && b.external_url ? (
                    <a href={b.external_url} target="_blank" rel="noopener noreferrer" className="block rounded-2xl bg-[#111] px-4 py-3 text-center font-semibold text-[#D9BC6A]">
                      Acessar benefício
                    </a>
                  ) : eligible ? (
                    <button type="button" onClick={onQr} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#111] px-4 py-3 font-semibold text-[#D9BC6A]">
                      <Icon d={I.qr} size={18} color="#D9BC6A" /> Usar com a carteirinha
                    </button>
                  ) : null}
                </div>
              ))}
            </section>

            {p.branches.length ? (
              <section className="space-y-2">
                <h3 className="font-bold">Onde usar</h3>
                {p.branches.map((b) => {
                  const dest = b.lat != null && b.lng != null ? `${b.lat},${b.lng}` : encodeURIComponent([b.address, b.city, b.uf].filter(Boolean).join(", "));
                  const w = wa(b.whatsapp);
                  return (
                    <div key={b.id} className="space-y-2 rounded-3xl bg-white p-4">
                      <p className="font-semibold">{b.name}</p>
                      <p className="text-sm text-[#4B4F56]">{[b.address, b.city, b.uf].filter(Boolean).join(" · ")}</p>
                      {b.hours ? <p className="text-xs text-[#6B6F76]">🕒 {b.hours}</p> : null}
                      <div className="flex flex-wrap gap-2">
                        {b.address || b.lat ? (
                          <a href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded-xl bg-[#111] px-3 py-2 text-sm font-semibold text-[#D9BC6A]">
                            <Icon d={I.nav} size={16} color="#D9BC6A" /> Como chegar
                          </a>
                        ) : null}
                        {b.phone ? (
                          <a href={`tel:${digits(b.phone)}`} className="rounded-xl px-3 py-2 text-sm ring-1 ring-[#ECE7DB]">
                            Ligar
                          </a>
                        ) : null}
                        {w ? (
                          <a href={w} target="_blank" rel="noopener noreferrer" className="rounded-xl px-3 py-2 text-sm ring-1 ring-[#ECE7DB]">
                            WhatsApp
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </BodyPortal>
  );
}

/* -------------------------------- Histórico -------------------------------- */
function History({ uses, reload }: { uses: Use[]; reload: () => Promise<void> }) {
  async function rate(id: string, rating: number) {
    await fetch("/api/club/rate", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redemption_id: id, rating }) }).catch(() => undefined);
    void reload();
  }
  if (!uses.length) return <p className="rounded-3xl bg-white p-6 text-center text-sm text-[#6B6F76]">Quando você usar um benefício com a carteirinha, ele aparece aqui com quanto você economizou.</p>;
  return (
    <ul className="space-y-2">
      {uses.map((u) => (
        <li key={u.id} className="rounded-3xl bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-semibold">{u.partner}</p>
              <p className="text-xs text-[#6B6F76]">{new Date(u.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <p className={`shrink-0 font-bold ${u.status === "cancelado" ? "text-[#9A9DA3] line-through" : "text-[#1F7A4C]"}`}>{brl(Number(u.saved_amount ?? 0))}</p>
          </div>
          {u.status === "registrado" ? (
            <div className="mt-2 flex items-center gap-1" aria-label="Avaliar atendimento">
              <span className="mr-1 text-xs text-[#6B6F76]">{u.rating ? "Sua nota:" : "Avalie:"}</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" onClick={() => void rate(u.id, n)} className="p-0.5 text-xl leading-none" aria-label={`${n} estrela(s)`}>
                  <span style={{ color: (u.rating ?? 0) >= n ? "#C9A84C" : "#D9D5CB" }}>★</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-1 text-xs text-[#9A9DA3]">Uso cancelado pela Prime</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------ Indicar parceiro ------------------------------ */
function SuggestSheet({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ company: "", category: "", city: "", contact: "", phone: "", notes: "" });
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const field = "w-full rounded-xl border border-[#E5E0D4] bg-white px-3 py-3 text-base";
  async function send() {
    if (f.company.trim().length < 2) return setMsg({ ok: false, t: "Informe o nome do estabelecimento." });
    setBusy(true);
    const r = await fetch("/api/club/suggest", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    setBusy(false);
    if (r?.ok) setMsg({ ok: true, t: "Obrigado! A equipe da Prime vai entrar em contato com o estabelecimento." });
    else setMsg({ ok: false, t: "Não foi possível enviar agora. Tente de novo." });
  }
  const inp = (k: keyof typeof f, label: string, extra?: Record<string, string>) => (
    <label className="grid gap-1 text-sm text-[#6B6F76]">
      {label}
      <input className={field} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} />
    </label>
  );
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
        <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-[28px] bg-[#F6F4EF] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-lg font-bold">Indicar estabelecimento</p>
            <button type="button" onClick={onClose} className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-[#ECE7DB]">
              Fechar
            </button>
          </div>
          {msg?.ok ? (
            <p className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{msg.t}</p>
          ) : (
            <div className="grid gap-3">
              {inp("company", "Nome do estabelecimento")}
              {inp("category", "Tipo (posto, oficina, academia…)")}
              {inp("city", "Cidade / bairro")}
              {inp("contact", "Com quem falar (se souber)")}
              {inp("phone", "Telefone / WhatsApp (se souber)", { inputMode: "tel" })}
              <label className="grid gap-1 text-sm text-[#6B6F76]">
                Observação
                <textarea className={`${field} min-h-[80px]`} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
              </label>
              {msg ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{msg.t}</p> : null}
              <button type="button" disabled={busy} onClick={() => void send()} className="w-full rounded-2xl bg-[#111] px-4 py-3.5 font-semibold text-[#D9BC6A] disabled:opacity-50">
                {busy ? "Enviando…" : "Enviar indicação"}
              </button>
            </div>
          )}
        </div>
      </div>
    </BodyPortal>
  );
}
