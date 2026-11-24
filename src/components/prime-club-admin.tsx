"use client";

import { useCallback, useEffect, useState } from "react";
import { BodyPortal } from "@/components/ui/body-portal";
import { BENEFIT_KINDS, CATEGORY_ICONS, KIND_LABEL, PROSPECT_STAGES, benefitHeadline, type BenefitKind } from "@/lib/club/club";

type Category = { id: string; name: string; icon: string; position: number; active: boolean };
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
  status: "rascunho" | "publicado" | "inativo";
  publish_at: string | null;
  featured: boolean;
  notes: string | null;
  contract_path: string | null;
  has_pin: boolean;
};
type Branch = { id: string; partner_id: string; name: string; address: string | null; city: string | null; uf: string | null; lat: number | null; lng: number | null; hours: string | null; phone: string | null; whatsapp: string | null; active: boolean };
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
  valid_from: string | null;
  valid_until: string | null;
  max_uses_per_driver: number | null;
  max_uses_per_month: number | null;
  featured: boolean;
  active: boolean;
};
type Prospect = {
  id: string;
  company: string;
  category: string | null;
  city: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  stage: string;
  owner: string | null;
  next_followup: string | null;
  proposal: string | null;
  notes: string | null;
  updated_at: string;
  suggested_by_driver: string | null;
};
type Overview = {
  partners_total: number;
  partners_live: number;
  benefits_active: number;
  drivers_eligible: number;
  saved_total: number;
  saved_month: number;
  uses_month: number;
  stages: Record<string, number>;
  drivers: { id: string; name: string; blocked: boolean }[];
  redemptions: { id: string; at: string; driver: string; partner: string; saved: number; purchase: number | null; status: string; source: string }[];
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const field = "w-full rounded-xl border border-prime-border bg-white px-3 py-2.5 text-sm";
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<{ ok: boolean; data?: T; error?: string }> {
  const r = await fetch(url, {
    credentials: "include",
    ...init,
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body
  }).catch(() => null);
  const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: T; error?: { message?: string } }) : {};
  return r?.ok && j.success ? { ok: true, data: j.data } : { ok: false, error: j.error?.message ?? "Não foi possível salvar." };
}

function Icon({ d, size = 20, color = "currentColor" }: { d: string; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

async function upload(file: File, kind: "imagem" | "contrato"): Promise<{ url?: string; path?: string; error?: string }> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const r = await api<{ url?: string; path?: string }>("/api/club/admin/upload", { method: "POST", body: fd });
  return r.ok ? (r.data ?? {}) : { error: r.error };
}

const TABS = [
  ["geral", "Visão geral"],
  ["parceiros", "Estabelecimentos"],
  ["hunter", "Hunter (prospecção)"],
  ["usos", "Usos e motoristas"],
  ["categorias", "Categorias"]
] as const;
type Tab = (typeof TABS)[number][0];

export function PrimeClubAdmin() {
  const [tab, setTab] = useState<Tab>("geral");
  const [cats, setCats] = useState<Category[]>([]);
  const loadCats = useCallback(async () => {
    const r = await api<Category[]>("/api/club/admin/categories");
    if (r.ok) setCats(r.data ?? []);
  }, []);
  useEffect(() => {
    void loadCats();
  }, [loadCats]);
  return (
    <div className="space-y-4">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {TABS.map(([k, t]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === k ? "bg-[#111] text-[#D9BC6A]" : "bg-white text-[#111] ring-1 ring-prime-border"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "geral" ? <OverviewTab onGo={setTab} /> : null}
      {tab === "parceiros" ? <PartnersTab cats={cats} /> : null}
      {tab === "hunter" ? <HunterTab cats={cats} /> : null}
      {tab === "usos" ? <UsesTab /> : null}
      {tab === "categorias" ? <CategoriesTab cats={cats} reload={loadCats} /> : null}
    </div>
  );
}

/* ------------------------------ Visão geral ------------------------------ */
function OverviewTab({ onGo }: { onGo: (t: Tab) => void }) {
  const [o, setO] = useState<Overview | null>(null);
  useEffect(() => {
    void api<Overview>("/api/club/admin/overview").then((r) => r.ok && setO(r.data ?? null));
  }, []);
  if (!o) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  const stats: [string, string, string][] = [
    ["Parceiros no app", `${o.partners_live}`, `${o.partners_total} cadastrados`],
    ["Benefícios ativos", `${o.benefits_active}`, "dentro da validade"],
    ["Motoristas elegíveis", `${o.drivers_eligible}`, "ativos e liberados"],
    ["Economia no mês", brl(o.saved_month), `${o.uses_month} uso(s) · ${brl(o.saved_total)} no total`]
  ];
  const funnel = PROSPECT_STAGES.filter(([k]) => k !== "perdido");
  const max = Math.max(1, ...funnel.map(([k]) => o.stages[k] ?? 0));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([t, v, s]) => (
          <div key={t} className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
            <p className="text-xs text-prime-muted">{t}</p>
            <p className="mt-1 text-2xl font-semibold" style={{ color: "#111" }}>
              {v}
            </p>
            <p className="mt-0.5 text-[11px] text-prime-muted">{s}</p>
          </div>
        ))}
      </div>
      <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: "#111" }}>
            Hunter Prime Club
          </h3>
          <button type="button" onClick={() => onGo("hunter")} className="text-sm font-semibold text-prime-gold-ink">
            Abrir →
          </button>
        </div>
        <ul className="mt-3 grid gap-2">
          {funnel.map(([k, t]) => (
            <li key={k} className="grid grid-cols-[150px_1fr_32px] items-center gap-2 text-sm sm:grid-cols-[190px_1fr_40px]">
              <span className="truncate text-prime-muted">{t}</span>
              <span className="h-2 overflow-hidden rounded-full bg-[#F1EDE3]">
                <span className="block h-full rounded-full bg-[#C9A84C]" style={{ width: `${((o.stages[k] ?? 0) / max) * 100}%` }} />
              </span>
              <span className="text-right font-semibold">{o.stages[k] ?? 0}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: "#111" }}>
            Últimos usos
          </h3>
          <button type="button" onClick={() => onGo("usos")} className="text-sm font-semibold text-prime-gold-ink">
            Ver todos →
          </button>
        </div>
        {o.redemptions.length ? (
          <ul className="mt-2 divide-y divide-prime-border text-sm">
            {o.redemptions.slice(0, 6).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.partner}</span>
                  <span className="block truncate text-xs text-prime-muted">
                    {r.driver} · {when(r.at)}
                  </span>
                </span>
                <span className={`shrink-0 font-semibold ${r.status === "cancelado" ? "text-prime-muted line-through" : "text-emerald-700"}`}>{brl(r.saved)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-prime-muted">Nenhum uso ainda. Quando um estabelecimento validar a carteirinha, aparece aqui.</p>
        )}
      </section>
    </div>
  );
}

/* ---------------------------- Estabelecimentos ---------------------------- */
const STATUS: Record<Partner["status"], { t: string; cls: string }> = {
  rascunho: { t: "Rascunho", cls: "bg-[#F1EFEA] text-[#6F6A60]" },
  publicado: { t: "Publicado", cls: "bg-[#EAF6EF] text-[#1F7A4C]" },
  inativo: { t: "Inativo", cls: "bg-red-50 text-red-700" }
};

function PartnersTab({ cats }: { cats: Category[] }) {
  const [list, setList] = useState<Partner[] | null>(null);
  const [edit, setEdit] = useState<Partner | "novo" | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(async () => {
    const r = await api<Partner[]>("/api/club/admin/partners");
    setList(r.ok ? (r.data ?? []) : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const catName = (id: string | null) => cats.find((c) => c.id === id)?.name ?? "Sem categoria";
  const shown = (list ?? []).filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar estabelecimento" className={`${field} min-w-0 flex-1 sm:max-w-xs`} />
        <button type="button" onClick={() => setEdit("novo")} className="rounded-xl bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#D9BC6A]">
          + Novo estabelecimento
        </button>
      </div>
      {!list ? <div className="h-32 animate-pulse rounded-2xl bg-white" /> : null}
      {list && !shown.length ? (
        <p className="rounded-2xl border border-dashed border-prime-border bg-white p-8 text-center text-sm text-prime-muted">
          Nenhum estabelecimento ainda. Cadastre o primeiro parceiro; ele só aparece no app quando estiver como “Publicado”.
        </p>
      ) : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" onClick={() => setEdit(p)} className="flex w-full items-center gap-3 rounded-2xl border border-prime-border bg-white p-3 text-left shadow-prime-card">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#F6F2E8]">
                {p.logo_url ? <img src={p.logo_url} alt="" className="h-full w-full object-cover" /> : <Icon d={CATEGORY_ICONS[cats.find((c) => c.id === p.category_id)?.icon ?? "tag"] ?? CATEGORY_ICONS.tag} color="#A8873A" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-[#111]">{p.name}</span>
                <span className="block truncate text-xs text-prime-muted">
                  {catName(p.category_id)}
                  {p.featured ? " · ★ destaque" : ""}
                  {!p.has_pin ? " · sem PIN de validação" : ""}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[p.status].cls}`}>{STATUS[p.status].t}</span>
            </button>
          </li>
        ))}
      </ul>
      {edit ? (
        <PartnerEditor
          partner={edit === "novo" ? null : edit}
          cats={cats}
          onClose={() => setEdit(null)}
          onSaved={(p) => {
            void load();
            if (p) setEdit(p);
          }}
        />
      ) : null}
    </div>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[120] flex justify-end bg-black/40" onClick={onClose}>
        <div
          className="flex h-dvh w-full max-w-2xl flex-col bg-prime-bg pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 border-b border-prime-border bg-white px-4 py-3">
            <h3 className="truncate text-lg font-semibold" style={{ color: "#111" }}>
              {title}
            </h3>
            <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-sm ring-1 ring-prime-border">
              Fechar
            </button>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">{children}</div>
        </div>
      </div>
    </BodyPortal>
  );
}

function Box({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-prime-border bg-white p-4">
      <div>
        <p className="font-semibold" style={{ color: "#111" }}>
          {title}
        </p>
        {hint ? <p className="text-xs text-prime-muted">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

function L({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={`grid gap-1 text-xs text-prime-muted ${wide ? "sm:col-span-2" : ""}`}>
      {label}
      {children}
    </label>
  );
}

function PartnerEditor({ partner, cats, onClose, onSaved }: { partner: Partner | null; cats: Category[]; onClose: () => void; onSaved: (p: Partner | null) => void }) {
  const [p, setP] = useState<Partial<Partner>>(partner ?? { status: "rascunho", featured: false });
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Partner>(k: K, v: Partner[K] | null) => setP((x) => ({ ...x, [k]: v }));
  const txt = (k: keyof Partner) => ({ value: (p[k] as string | null) ?? "", onChange: (e: { target: { value: string } }) => set(k, e.target.value as never) });

  async function save() {
    if (!p.name || p.name.trim().length < 2) return setMsg({ ok: false, t: "Informe o nome do estabelecimento." });
    if (pin && !/^\d{4,6}$/.test(pin)) return setMsg({ ok: false, t: "O PIN precisa ter de 4 a 6 números." });
    setBusy(true);
    const body = {
      name: p.name,
      category_id: p.category_id || null,
      description: p.description || null,
      logo_url: p.logo_url || null,
      cover_url: p.cover_url || null,
      phone: p.phone || null,
      whatsapp: p.whatsapp || null,
      website: p.website || null,
      instagram: p.instagram || null,
      status: p.status,
      publish_at: p.publish_at || null,
      featured: Boolean(p.featured),
      notes: p.notes || null,
      ...(pin ? { validation_pin: pin } : {})
    };
    const r = partner ? await api<Partner>(`/api/club/admin/partners/${partner.id}`, { method: "PATCH", json: body }) : await api<Partner>("/api/club/admin/partners", { method: "POST", json: body });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, t: r.error ?? "Erro ao salvar." });
    setPin("");
    setMsg({ ok: true, t: partner ? "Salvo." : "Estabelecimento criado. Agora cadastre as filiais e os benefícios abaixo." });
    onSaved(r.data ?? null);
  }

  async function onFile(k: "logo_url" | "cover_url", f: File | undefined) {
    if (!f) return;
    setMsg({ ok: true, t: "Enviando imagem…" });
    const r = await upload(f, "imagem");
    if (r.url) {
      set(k, r.url);
      setMsg({ ok: true, t: "Imagem enviada. Clique em Salvar." });
    } else setMsg({ ok: false, t: r.error ?? "Não foi possível enviar." });
  }

  async function onContract(f: File | undefined) {
    if (!f || !partner) return;
    const r = await upload(f, "contrato");
    if (!r.path) return setMsg({ ok: false, t: r.error ?? "Não foi possível enviar." });
    const s = await api(`/api/club/admin/partners/${partner.id}`, { method: "PATCH", json: { notes: `${p.notes ?? ""}${p.notes ? "\n" : ""}Contrato enviado em ${new Date().toLocaleDateString("pt-BR")}: ${r.path}` } });
    setMsg(s.ok ? { ok: true, t: "Contrato anexado (guardado em pasta privada)." } : { ok: false, t: s.error ?? "Erro" });
  }

  async function remove() {
    if (!partner || !window.confirm(`Excluir ${partner.name}? Se já tiver usos registrados, ele fica apenas inativo.`)) return;
    const r = await api<{ deactivated?: boolean }>(`/api/club/admin/partners/${partner.id}`, { method: "DELETE" });
    if (r.ok) {
      onSaved(null);
      onClose();
    }
  }

  return (
    <Sheet title={partner ? partner.name : "Novo estabelecimento"} onClose={onClose}>
      <Box title="Dados do estabelecimento">
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="Nome">
            <input className={field} {...txt("name")} />
          </L>
          <L label="Categoria">
            <select className={field} value={p.category_id ?? ""} onChange={(e) => set("category_id", e.target.value || null)}>
              <option value="">Escolher…</option>
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </L>
          <L label="Descrição institucional" wide>
            <textarea className={`${field} min-h-[90px]`} {...txt("description")} />
          </L>
          <L label="Telefone">
            <input className={field} inputMode="tel" {...txt("phone")} />
          </L>
          <L label="WhatsApp">
            <input className={field} inputMode="tel" {...txt("whatsapp")} />
          </L>
          <L label="Site">
            <input className={field} {...txt("website")} placeholder="https://" />
          </L>
          <L label="Instagram">
            <input className={field} {...txt("instagram")} placeholder="@" />
          </L>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["logo_url", "cover_url"] as const).map((k) => (
            <div key={k} className="grid gap-2 rounded-xl bg-prime-bg p-3">
              <span className="text-xs font-semibold">{k === "logo_url" ? "Logomarca (quadrada)" : "Imagem de capa (horizontal)"}</span>
              {p[k] ? <img src={p[k] as string} alt="" className={`${k === "logo_url" ? "h-20 w-20" : "h-24 w-full"} rounded-lg object-cover`} /> : null}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void onFile(k, e.target.files?.[0])} className="text-xs" />
            </div>
          ))}
        </div>
      </Box>

      <Box title="Publicação" hint="Só aparece no app dos motoristas quando estiver Publicado (e depois da data, se você programar).">
        <div className="grid grid-cols-3 gap-2">
          {(["rascunho", "publicado", "inativo"] as const).map((s) => (
            <button key={s} type="button" onClick={() => set("status", s)} className={`rounded-xl px-3 py-2 text-sm font-semibold ${p.status === s ? "bg-[#111] text-[#D9BC6A]" : "bg-white ring-1 ring-prime-border"}`}>
              {STATUS[s].t}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <L label="Publicar a partir de (opcional)">
            <input
              type="datetime-local"
              className={field}
              value={p.publish_at ? new Date(new Date(p.publish_at).getTime() - 3 * 3600000).toISOString().slice(0, 16) : ""}
              onChange={(e) => set("publish_at", e.target.value ? `${e.target.value}:00-03:00` : null)}
            />
          </L>
          <label className="flex items-center gap-2 self-end rounded-xl bg-prime-bg px-3 py-3 text-sm">
            <input type="checkbox" checked={Boolean(p.featured)} onChange={(e) => set("featured", e.target.checked)} />
            Mostrar em destaque no app
          </label>
        </div>
      </Box>

      <Box title="Validação da carteirinha" hint="O estabelecimento lê o QR da carteirinha e digita este PIN para confirmar o desconto. Combine o PIN só com o responsável da loja.">
        <div className="flex flex-wrap items-center gap-2">
          <input className={`${field} max-w-[180px] tracking-[0.4em]`} inputMode="numeric" maxLength={6} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" />
          <span className="text-xs text-prime-muted">{partner?.has_pin ? "PIN já definido. Digite um novo só se quiser trocar." : "Ainda sem PIN: sem ele a loja não consegue validar."}</span>
        </div>
      </Box>

      <Box title="Observações internas">
        <textarea className={`${field} min-h-[70px]`} {...txt("notes")} placeholder="Condições combinadas, responsável, renovação…" />
        {partner ? (
          <label className="grid gap-1 text-xs text-prime-muted">
            Anexar contrato ou termo de parceria (PDF ou imagem, fica privado)
            <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(e) => void onContract(e.target.files?.[0])} className="text-xs" />
          </label>
        ) : null}
      </Box>

      {msg ? <p className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.t}</p> : null}
      <div className="sticky bottom-0 -mx-4 flex gap-2 border-t border-prime-border bg-white px-4 py-3">
        <button type="button" disabled={busy} onClick={() => void save()} className="flex-1 rounded-xl bg-[#111] px-4 py-3 text-sm font-semibold text-[#D9BC6A] disabled:opacity-50">
          {busy ? "Salvando…" : partner ? "Salvar" : "Criar estabelecimento"}
        </button>
        {partner ? (
          <button type="button" onClick={() => void remove()} className="rounded-xl px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            Excluir
          </button>
        ) : null}
      </div>

      {partner ? <BranchesBox partnerId={partner.id} /> : null}
      {partner ? <BenefitsBox partnerId={partner.id} /> : null}
    </Sheet>
  );
}

function BranchesBox({ partnerId }: { partnerId: string }) {
  const [list, setList] = useState<Branch[]>([]);
  const [edit, setEdit] = useState<Partial<Branch> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<Branch[]>(`/api/club/admin/branches?partner=${partnerId}`);
    if (r.ok) setList(r.data ?? []);
  }, [partnerId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save() {
    if (!edit?.name) return setErr("Dê um nome à filial (ex.: Unidade Praia do Canto).");
    const body = {
      partner_id: partnerId,
      name: edit.name,
      address: edit.address || null,
      city: edit.city || null,
      uf: edit.uf || null,
      lat: edit.lat ?? null,
      lng: edit.lng ?? null,
      hours: edit.hours || null,
      phone: edit.phone || null,
      whatsapp: edit.whatsapp || null,
      active: edit.active ?? true
    };
    const r = edit.id ? await api(`/api/club/admin/branches/${edit.id}`, { method: "PATCH", json: body }) : await api("/api/club/admin/branches", { method: "POST", json: body });
    if (!r.ok) return setErr(r.error ?? "Erro");
    setEdit(null);
    setErr(null);
    void load();
  }
  /** Busca latitude/longitude pelo endereço (para "perto de você" e "como chegar"). */
  async function geocode() {
    if (!edit?.address) return setErr("Preencha o endereço primeiro.");
    const r = await fetch(`/api/club/admin/geocode?q=${encodeURIComponent([edit.address, edit.city, edit.uf].filter(Boolean).join(", "))}`, { credentials: "include" }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { data?: { lat?: number; lng?: number } | { lat?: number; lng?: number }[] }) : {};
    const hit = Array.isArray(j.data) ? j.data.at(0) : j.data;
    if (hit?.lat && hit?.lng) {
      setEdit((x) => ({ ...x, lat: hit.lat, lng: hit.lng }));
      setErr(null);
    } else setErr("Não encontrei o endereço no mapa. Confira ou deixe sem localização.");
  }
  const t = (k: keyof Branch) => ({ value: (edit?.[k] as string | null) ?? "", onChange: (e: { target: { value: string } }) => setEdit((x) => ({ ...x, [k]: e.target.value })) });
  return (
    <Box title={`Filiais / unidades (${list.length})`} hint="Endereços onde o benefício vale. Uma rede pode ter várias unidades com condições diferentes.">
      <ul className="grid gap-2">
        {list.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => setEdit(b)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-prime-bg px-3 py-2.5 text-left text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{b.name}</span>
                <span className="block truncate text-xs text-prime-muted">{[b.address, b.city, b.uf].filter(Boolean).join(" · ") || "Sem endereço"}</span>
              </span>
              <span className="shrink-0 text-xs text-prime-muted">{b.lat ? "📍" : ""}{b.active ? "" : " inativa"}</span>
            </button>
          </li>
        ))}
      </ul>
      {edit ? (
        <div className="grid gap-3 rounded-xl border border-prime-border p-3 sm:grid-cols-2">
          <L label="Nome da unidade">
            <input className={field} {...t("name")} />
          </L>
          <L label="Endereço">
            <input className={field} {...t("address")} />
          </L>
          <L label="Cidade">
            <input className={field} {...t("city")} />
          </L>
          <L label="UF">
            <input className={field} maxLength={2} {...t("uf")} />
          </L>
          <L label="Horário de funcionamento">
            <input className={field} {...t("hours")} placeholder="Seg a sex 8h–18h · sáb 8h–12h" />
          </L>
          <L label="Telefone / WhatsApp da unidade">
            <input className={field} {...t("whatsapp")} />
          </L>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
            <button type="button" onClick={() => void geocode()} className="rounded-xl px-3 py-2 text-sm ring-1 ring-prime-border">
              📍 Localizar no mapa
            </button>
            <span className="text-xs text-prime-muted">{edit.lat ? `Localização: ${Number(edit.lat).toFixed(4)}, ${Number(edit.lng).toFixed(4)}` : "Sem localização"}</span>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit((x) => ({ ...x, active: e.target.checked }))} /> Ativa
            </label>
          </div>
          {err ? <p className="text-sm text-red-700 sm:col-span-2">{err}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" onClick={() => void save()} className="flex-1 rounded-xl bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#D9BC6A]">
              Salvar unidade
            </button>
            <button type="button" onClick={() => setEdit(null)} className="rounded-xl px-4 py-2.5 text-sm ring-1 ring-prime-border">
              Cancelar
            </button>
            {edit.id ? (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Excluir esta unidade?")) return;
                  await api(`/api/club/admin/branches/${edit.id}`, { method: "DELETE" });
                  setEdit(null);
                  void load();
                }}
                className="rounded-xl px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200"
              >
                Excluir
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEdit({ active: true })} className="w-full rounded-xl border border-dashed border-[#C9A84C] px-4 py-2.5 text-sm font-semibold">
          + Adicionar unidade
        </button>
      )}
    </Box>
  );
}

function BenefitsBox({ partnerId }: { partnerId: string }) {
  const [list, setList] = useState<Benefit[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [edit, setEdit] = useState<Partial<Benefit> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const [a, b] = await Promise.all([api<Benefit[]>(`/api/club/admin/benefits?partner=${partnerId}`), api<Branch[]>(`/api/club/admin/branches?partner=${partnerId}`)]);
    if (a.ok) setList(a.data ?? []);
    if (b.ok) setBranches(b.data ?? []);
  }, [partnerId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save() {
    if (!edit?.title || !edit.kind) return setErr("Preencha o título e o tipo do benefício.");
    const body = {
      partner_id: partnerId,
      title: edit.title,
      description: edit.description || null,
      kind: edit.kind,
      value: edit.value === undefined || edit.value === null || (edit.value as unknown) === "" ? null : Number(edit.value),
      coupon_code: edit.coupon_code || null,
      external_url: edit.external_url || null,
      rules: edit.rules || null,
      valid_from: edit.valid_from || null,
      valid_until: edit.valid_until || null,
      max_uses_per_driver: edit.max_uses_per_driver ? Number(edit.max_uses_per_driver) : null,
      max_uses_per_month: edit.max_uses_per_month ? Number(edit.max_uses_per_month) : null,
      branch_ids: edit.branch_ids?.length ? edit.branch_ids : null,
      featured: Boolean(edit.featured),
      active: edit.active ?? true
    };
    const r = edit.id ? await api(`/api/club/admin/benefits/${edit.id}`, { method: "PATCH", json: body }) : await api("/api/club/admin/benefits", { method: "POST", json: body });
    if (!r.ok) return setErr(r.error ?? "Erro");
    setEdit(null);
    setErr(null);
    void load();
  }
  const t = (k: keyof Benefit) => ({ value: (edit?.[k] as string | null) ?? "", onChange: (e: { target: { value: string } }) => setEdit((x) => ({ ...x, [k]: e.target.value })) });
  const valueLabel: Partial<Record<BenefitKind, string>> = { percentual: "Desconto (%)", valor: "Desconto (R$)", por_litro: "Desconto por litro (R$)", preco_exclusivo: "Preço exclusivo (R$)" };
  return (
    <Box title={`Benefícios e cupons (${list.length})`} hint="O que o motorista ganha. Um estabelecimento pode ter vários benefícios.">
      <ul className="grid gap-2">
        {list.map((b) => (
          <li key={b.id}>
            <button type="button" onClick={() => setEdit(b)} className="flex w-full items-center justify-between gap-2 rounded-xl bg-prime-bg px-3 py-2.5 text-left text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{b.title}</span>
                <span className="block truncate text-xs text-prime-muted">
                  {benefitHeadline(b)} · {KIND_LABEL[b.kind]}
                  {b.valid_until ? ` · até ${b.valid_until.split("-").reverse().join("/")}` : ""}
                </span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${b.active ? "bg-emerald-50 text-emerald-700" : "bg-[#F1EFEA] text-prime-muted"}`}>{b.active ? "Ativo" : "Pausado"}</span>
            </button>
          </li>
        ))}
      </ul>
      {edit ? (
        <div className="grid gap-3 rounded-xl border border-prime-border p-3 sm:grid-cols-2">
          <L label="Título (aparece no app)" wide>
            <input className={field} {...t("title")} placeholder="Ex.: 15% em alinhamento e balanceamento" />
          </L>
          <L label="Tipo de benefício">
            <select className={field} value={edit.kind ?? ""} onChange={(e) => setEdit((x) => ({ ...x, kind: e.target.value as BenefitKind }))}>
              <option value="">Escolher…</option>
              {BENEFIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </L>
          {edit.kind && valueLabel[edit.kind] ? (
            <L label={valueLabel[edit.kind] as string}>
              <input className={field} inputMode="decimal" {...t("value")} />
            </L>
          ) : null}
          {edit.kind === "cupom" ? (
            <L label="Código do cupom">
              <input className={field} {...t("coupon_code")} placeholder="PRIME15" />
            </L>
          ) : null}
          {edit.kind === "link" ? (
            <L label="Link externo">
              <input className={field} {...t("external_url")} placeholder="https://" />
            </L>
          ) : null}
          <L label="Descrição" wide>
            <textarea className={`${field} min-h-[70px]`} {...t("description")} />
          </L>
          <L label="Regras de uso" wide>
            <textarea className={`${field} min-h-[70px]`} {...t("rules")} placeholder="Serviços participantes, não cumulativo, apresentar carteirinha…" />
          </L>
          <L label="Válido de">
            <input type="date" className={field} {...t("valid_from")} />
          </L>
          <L label="Válido até">
            <input type="date" className={field} {...t("valid_until")} />
          </L>
          <L label="Limite por motorista (total)">
            <input className={field} inputMode="numeric" {...t("max_uses_per_driver")} placeholder="Sem limite" />
          </L>
          <L label="Limite por motorista no mês">
            <input className={field} inputMode="numeric" {...t("max_uses_per_month")} placeholder="Sem limite" />
          </L>
          {branches.length > 1 ? (
            <div className="grid gap-1 sm:col-span-2">
              <span className="text-xs text-prime-muted">Vale em quais unidades? (nenhuma marcada = todas)</span>
              <div className="flex flex-wrap gap-2">
                {branches.map((br) => {
                  const on = edit.branch_ids?.includes(br.id) ?? false;
                  return (
                    <button
                      key={br.id}
                      type="button"
                      onClick={() => setEdit((x) => ({ ...x, branch_ids: on ? (x?.branch_ids ?? []).filter((i) => i !== br.id) : [...(x?.branch_ids ?? []), br.id] }))}
                      className={`rounded-full px-3 py-1.5 text-xs ${on ? "bg-[#111] text-white" : "bg-white ring-1 ring-prime-border"}`}
                    >
                      {br.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit((x) => ({ ...x, active: e.target.checked }))} /> Ativo
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={Boolean(edit.featured)} onChange={(e) => setEdit((x) => ({ ...x, featured: e.target.checked }))} /> Destaque
            </label>
          </div>
          {err ? <p className="text-sm text-red-700 sm:col-span-2">{err}</p> : null}
          <div className="flex gap-2 sm:col-span-2">
            <button type="button" onClick={() => void save()} className="flex-1 rounded-xl bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#D9BC6A]">
              Salvar benefício
            </button>
            <button type="button" onClick={() => setEdit(null)} className="rounded-xl px-4 py-2.5 text-sm ring-1 ring-prime-border">
              Cancelar
            </button>
            {edit.id ? (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Excluir este benefício? Se já foi usado, ele fica só pausado.")) return;
                  await api(`/api/club/admin/benefits/${edit.id}`, { method: "DELETE" });
                  setEdit(null);
                  void load();
                }}
                className="rounded-xl px-3 py-2.5 text-sm text-red-700 ring-1 ring-red-200"
              >
                Excluir
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setEdit({ active: true, kind: "percentual" })} className="w-full rounded-xl border border-dashed border-[#C9A84C] px-4 py-2.5 text-sm font-semibold">
          + Adicionar benefício
        </button>
      )}
    </Box>
  );
}

/* --------------------------------- Hunter --------------------------------- */
function HunterTab({ cats }: { cats: Category[] }) {
  const [list, setList] = useState<Prospect[] | null>(null);
  const [stage, setStage] = useState<string>("ativos");
  const [edit, setEdit] = useState<Partial<Prospect> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api<Prospect[]>("/api/club/admin/prospects");
    setList(r.ok ? (r.data ?? []) : []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const all = list ?? [];
  const shown = all.filter((p) => (stage === "ativos" ? !["publicado", "perdido"].includes(p.stage) : stage === "followup" ? p.next_followup && p.next_followup <= today : p.stage === stage));
  const late = all.filter((p) => p.next_followup && p.next_followup <= today && !["publicado", "perdido"].includes(p.stage)).length;
  async function save() {
    if (!edit?.company) return setErr("Informe o nome da empresa.");
    const body = {
      company: edit.company,
      category: edit.category || null,
      city: edit.city || null,
      contact_name: edit.contact_name || null,
      phone: edit.phone || null,
      email: edit.email || null,
      stage: edit.stage ?? "prospectado",
      owner: edit.owner || null,
      next_followup: edit.next_followup || null,
      proposal: edit.proposal || null,
      notes: edit.notes || null
    };
    const r = edit.id ? await api(`/api/club/admin/prospects/${edit.id}`, { method: "PATCH", json: body }) : await api("/api/club/admin/prospects", { method: "POST", json: body });
    if (!r.ok) return setErr(r.error ?? "Erro");
    setEdit(null);
    setErr(null);
    void load();
  }
  async function move(p: Prospect, s: string) {
    setList((cur) => (cur ?? []).map((x) => (x.id === p.id ? { ...x, stage: s } : x)));
    await api(`/api/club/admin/prospects/${p.id}`, { method: "PATCH", json: { stage: s } });
  }
  const t = (k: keyof Prospect) => ({ value: (edit?.[k] as string | null) ?? "", onChange: (e: { target: { value: string } }) => setEdit((x) => ({ ...x, [k]: e.target.value })) });
  const stageName = (s: string) => PROSPECT_STAGES.find(([k]) => k === s)?.[1] ?? s;
  const chips: [string, string, number][] = [
    ["ativos", "Em andamento", all.filter((p) => !["publicado", "perdido"].includes(p.stage)).length],
    ["followup", "Retornar hoje", late],
    ...PROSPECT_STAGES.map(([k, n]) => [k, n, all.filter((p) => p.stage === k).length] as [string, string, number])
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEdit({ stage: "prospectado" })} className="rounded-xl bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#D9BC6A]">
          + Nova empresa para prospectar
        </button>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {chips.map(([k, n, c]) => (
          <button
            key={k}
            type="button"
            onClick={() => setStage(k)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${stage === k ? "bg-[#111] font-semibold text-white" : k === "followup" && c ? "bg-amber-50 text-amber-900 ring-1 ring-amber-300" : "bg-white ring-1 ring-prime-border"}`}
          >
            {n} <span className="opacity-70">{c}</span>
          </button>
        ))}
      </div>
      {!list ? <div className="h-32 animate-pulse rounded-2xl bg-white" /> : null}
      {list && !shown.length ? <p className="rounded-2xl border border-dashed border-prime-border bg-white p-8 text-center text-sm text-prime-muted">Nada aqui.</p> : null}
      <ul className="grid gap-3 md:grid-cols-2">
        {shown.map((p) => {
          const digits = (p.phone ?? "").replace(/\D/g, "");
          const overdue = p.next_followup && p.next_followup <= today && !["publicado", "perdido"].includes(p.stage);
          return (
            <li key={p.id} className={`grid gap-3 rounded-2xl border bg-white p-4 shadow-prime-card ${overdue ? "border-amber-300" : "border-prime-border"}`}>
              <button type="button" onClick={() => setEdit(p)} className="text-left">
                <span className="block font-semibold text-[#111]">{p.company}</span>
                <span className="block text-xs text-prime-muted">
                  {[p.category, p.city, p.contact_name].filter(Boolean).join(" · ") || "Sem detalhes"}
                  {p.suggested_by_driver ? " · indicado por motorista" : ""}
                </span>
                {p.next_followup ? (
                  <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${overdue ? "bg-amber-100 text-amber-900" : "bg-prime-bg text-prime-muted"}`}>
                    Retorno: {p.next_followup.split("-").reverse().join("/")}
                  </span>
                ) : null}
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <select value={p.stage} onChange={(e) => void move(p, e.target.value)} className="min-w-0 flex-1 rounded-xl border border-prime-border bg-white px-2 py-2 text-sm">
                  {PROSPECT_STAGES.map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
                {digits ? (
                  <a href={`https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}`} target="_blank" rel="noopener noreferrer" className="rounded-xl bg-[#1F7A4C] px-3 py-2 text-sm font-semibold text-[#fff]">
                    WhatsApp
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {edit ? (
        <Sheet title={edit.id ? (edit.company ?? "Empresa") : "Nova empresa"} onClose={() => setEdit(null)}>
          <Box title="Empresa e contato">
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Empresa">
                <input className={field} {...t("company")} />
              </L>
              <L label="Segmento">
                <input className={field} list="club-cats" {...t("category")} />
                <datalist id="club-cats">
                  {cats.map((c) => (
                    <option key={c.id} value={c.name} />
                  ))}
                </datalist>
              </L>
              <L label="Cidade">
                <input className={field} {...t("city")} />
              </L>
              <L label="Responsável na empresa">
                <input className={field} {...t("contact_name")} />
              </L>
              <L label="Telefone / WhatsApp">
                <input className={field} inputMode="tel" {...t("phone")} />
              </L>
              <L label="E-mail">
                <input className={field} type="email" {...t("email")} />
              </L>
            </div>
          </Box>
          <Box title="Negociação">
            <div className="grid gap-3 sm:grid-cols-2">
              <L label="Etapa">
                <select className={field} value={edit.stage ?? "prospectado"} onChange={(e) => setEdit((x) => ({ ...x, stage: e.target.value }))}>
                  {PROSPECT_STAGES.map(([k, n]) => (
                    <option key={k} value={k}>
                      {n}
                    </option>
                  ))}
                </select>
              </L>
              <L label="Responsável da Prime">
                <input className={field} {...t("owner")} />
              </L>
              <L label="Próximo retorno">
                <input type="date" className={field} {...t("next_followup")} />
              </L>
              <L label="Proposta / condição oferecida" wide>
                <textarea className={`${field} min-h-[70px]`} {...t("proposal")} />
              </L>
              <L label="Anotações" wide>
                <textarea className={`${field} min-h-[90px]`} {...t("notes")} />
              </L>
            </div>
            {edit.id && edit.stage ? <p className="text-xs text-prime-muted">Etapa atual: {stageName(edit.stage)}. Quando credenciar, cadastre em Estabelecimentos para publicar no app.</p> : null}
          </Box>
          {err ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">{err}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={() => void save()} className="flex-1 rounded-xl bg-[#111] px-4 py-3 text-sm font-semibold text-[#D9BC6A]">
              Salvar
            </button>
            {edit.id ? (
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm("Excluir esta empresa da prospecção?")) return;
                  await api(`/api/club/admin/prospects/${edit.id}`, { method: "DELETE" });
                  setEdit(null);
                  void load();
                }}
                className="rounded-xl px-4 py-3 text-sm text-red-700 ring-1 ring-red-200"
              >
                Excluir
              </button>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}

/* ---------------------------- Usos e motoristas ---------------------------- */
function UsesTab() {
  const [o, setO] = useState<Overview | null>(null);
  const load = useCallback(async () => {
    const r = await api<Overview>("/api/club/admin/overview");
    if (r.ok) setO(r.data ?? null);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!o) return <div className="h-40 animate-pulse rounded-2xl bg-white" />;
  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
        <h3 className="font-semibold" style={{ color: "#111" }}>
          Usos registrados
        </h3>
        <p className="text-xs text-prime-muted">A economia conta só o que o estabelecimento confirmou na validação.</p>
        {o.redemptions.length ? (
          <table className="pv-rtable mt-3 w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-prime-muted">
                <th className="py-2">Quando</th>
                <th>Motorista</th>
                <th>Estabelecimento</th>
                <th>Compra</th>
                <th>Economia</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {o.redemptions.map((r) => (
                <tr key={r.id} className="border-t border-prime-border">
                  <td className="py-2">{when(r.at)}</td>
                  <td>{r.driver}</td>
                  <td>{r.partner}</td>
                  <td>{r.purchase == null ? "—" : brl(r.purchase)}</td>
                  <td className={r.status === "cancelado" ? "text-prime-muted line-through" : "font-semibold text-emerald-700"}>{brl(r.saved)}</td>
                  <td>
                    {r.status === "registrado" ? (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm("Cancelar este uso? A economia sai dos relatórios.")) return;
                          await api("/api/club/admin/overview", { method: "PATCH", json: { redemption_id: r.id, cancel: true } });
                          void load();
                        }}
                        className="text-xs text-red-700 underline"
                      >
                        Cancelar
                      </button>
                    ) : (
                      <span className="text-xs text-prime-muted">Cancelado</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-3 text-sm text-prime-muted">Nenhum uso ainda.</p>
        )}
      </section>
      <section className="rounded-2xl border border-prime-border bg-white p-4 shadow-prime-card">
        <h3 className="font-semibold" style={{ color: "#111" }}>
          Motoristas no clube ({o.drivers.filter((d) => !d.blocked).length})
        </h3>
        <p className="text-xs text-prime-muted">Todo motorista ativo participa. Bloqueie quem não deve usar os benefícios.</p>
        <ul className="mt-3 divide-y divide-prime-border text-sm">
          {o.drivers.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0 truncate">{d.name}</span>
              <button
                type="button"
                onClick={async () => {
                  await api("/api/club/admin/overview", { method: "PATCH", json: { driver_id: d.id, blocked: !d.blocked } });
                  void load();
                }}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${d.blocked ? "bg-red-50 text-red-700 ring-1 ring-red-200" : "bg-emerald-50 text-emerald-700"}`}
              >
                {d.blocked ? "Bloqueado · liberar" : "Elegível"}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------- Categorias ------------------------------- */
function CategoriesTab({ cats, reload }: { cats: Category[]; reload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("tag");
  async function add() {
    if (name.trim().length < 2) return;
    await api("/api/club/admin/categories", { method: "POST", json: { name: name.trim(), icon, position: cats.length + 1 } });
    setName("");
    void reload();
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-2xl border border-prime-border bg-white p-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nova categoria (ex.: Lava-jato)" className={`${field} min-w-0 flex-1`} />
        <select value={icon} onChange={(e) => setIcon(e.target.value)} className={`${field} w-auto`}>
          {Object.keys(CATEGORY_ICONS).map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => void add()} className="rounded-xl bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#D9BC6A]">
          Adicionar
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {cats.map((c) => (
          <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-prime-border bg-white p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#F6F2E8]">
              <Icon d={CATEGORY_ICONS[c.icon] ?? CATEGORY_ICONS.tag} color="#A8873A" />
            </span>
            <input
              defaultValue={c.name}
              onBlur={async (e) => {
                if (e.target.value.trim() && e.target.value !== c.name) {
                  await api(`/api/club/admin/categories/${c.id}`, { method: "PATCH", json: { name: e.target.value.trim() } });
                  void reload();
                }
              }}
              className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-sm"
            />
            <button
              type="button"
              onClick={async () => {
                await api(`/api/club/admin/categories/${c.id}`, { method: "PATCH", json: { active: !c.active } });
                void reload();
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.active ? "bg-emerald-50 text-emerald-700" : "bg-[#F1EFEA] text-prime-muted"}`}
            >
              {c.active ? "Ativa" : "Oculta"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
