"use client";

import { useEffect, useState } from "react";

type Lead = {
  id: string;
  kind: "motorista" | "empresa";
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  company_name: string | null;
  segment: string | null;
  company_size: string | null;
  use_cases: string[] | null;
  details: Record<string, unknown>;
  utm: Record<string, string>;
  status: "novo" | "em_contato" | "aprovado" | "descartado";
  notes: string | null;
  created_at: string;
  complete_sent_at?: string | null;
  completed_at?: string | null;
};

type DocFile = { kind: string; label: string; image?: boolean; url: string | null };
type Complete = { data: Record<string, unknown> | null; completed_at: string | null; partial?: boolean; files: DocFile[]; missing?: { kind: string; label: string }[] };

const C_LABEL: [string, string][] = [
  ["full_name", "Nome"], ["cpf", "CPF"], ["rg", "RG"], ["birth_date", "Nascimento"], ["phone", "Celular"], ["email", "E-mail"],
  ["street", "Rua"], ["number", "Número"], ["complement", "Complemento"], ["district", "Bairro"], ["city", "Cidade"], ["uf", "UF"], ["cep", "CEP"],
  ["cnh_number", "CNH nº"], ["cnh_category", "Categoria"], ["cnh_expires_at", "Validade CNH"], ["cnh_first_date", "1ª habilitação"], ["cnh_ear", "EAR"],
  ["bond", "Vínculo"], ["company_name", "Razão social"], ["cnpj", "CNPJ"], ["issues_invoice", "Emite NF"], ["states", "Estados"], ["regions", "Regiões"],
  ["exec_experience", "Experiência executivo"], ["experience_time", "Tempo de experiência"], ["languages", "Idiomas"], ["languages_other", "Outro idioma"],
  ["formal_attire", "Traje social"], ["services", "Serviços de interesse"],
  ["vehicle_model", "Veículo"], ["vehicle_plate", "Placa"], ["vehicle_year", "Ano"], ["vehicle_color", "Cor"], ["insured", "Seguro"], ["insurance_app", "APP"], ["insurance_rcfv", "RCF-V"], ["other_vehicle", "Outro veículo"],
  ["criminal_record_date", "Emissão antecedentes"],
  ["pix_type", "Tipo PIX"], ["pix_key", "Chave PIX"], ["bank_account", "Banco/Ag/Conta"], ["account_holder", "Titular"],
  ["emergency_name", "Contato emergência"], ["emergency_phone", "Tel. emergência"], ["emergency_cpf", "CPF emergência"], ["emergency_email", "E-mail emergência"], ["emergency_relation", "Parentesco"], ["witness_ok", "Aceita ser testemunha"]
];
const fmtVal = (x: unknown) => (Array.isArray(x) ? x.join(", ") : x === "sim" ? "Sim" : x === "nao" ? "Não" : x === "autonomo" ? "Autônomo" : x === "mei" ? "MEI" : x === "pj" ? "Pessoa jurídica" : String(x));

const SHORT: Record<string, string> = {
  cnh: "CNH",
  comprovante_residencia: "Comprovante de residência",
  antecedentes: "Antecedentes criminais",
  crlv: "CRLV",
  foto_dianteira: "Frente do carro",
  foto_traseira: "Traseira do carro",
  foto_lateral_esquerda: "Lateral esquerda",
  foto_lateral_direita: "Lateral direita",
  apolice_seguro: "Apólice do seguro"
};

/** Documentos e fotos que o motorista mandou: fotos em miniatura (toque para ampliar) e PDFs em cartão. */
function DocsGallery({ files, missing, onZoom }: { files: DocFile[]; missing: { kind: string; label: string }[]; onZoom: (f: DocFile) => void }) {
  const photos = files.filter((f) => f.image && f.url);
  const docs = files.filter((f) => !f.image && f.url);
  return (
    <div className="grid gap-3">
      {photos.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {photos.map((f) => (
            <button key={f.kind} type="button" onClick={() => onZoom(f)} className="group overflow-hidden rounded-xl bg-white text-left ring-1 ring-prime-border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url!} alt={SHORT[f.kind] ?? f.label} loading="lazy" className="aspect-[4/3] w-full object-cover transition group-hover:opacity-90" />
              <span className="block truncate px-2 py-1.5 text-xs font-semibold">{SHORT[f.kind] ?? f.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {docs.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {docs.map((f) => (
            <a key={f.kind} href={f.url!} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-prime-border">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#FBEDEA] text-[11px] font-bold text-[#A33A2B]">PDF</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{SHORT[f.kind] ?? f.label}</span>
                <span className="block text-xs text-prime-muted">Toque para abrir</span>
              </span>
            </a>
          ))}
        </div>
      ) : null}
      {missing.length ? (
        <p className="rounded-xl bg-[#FBF3E0] px-3 py-2 text-xs text-[#8A5A00]">
          <b>Falta enviar:</b> {missing.map((m) => SHORT[m.kind] ?? m.label).join(", ")}
        </p>
      ) : null}
    </div>
  );
}

function CompleteView({ id }: { id: string }) {
  const [c, setC] = useState<Complete | null>(null);
  const [zoom, setZoom] = useState<DocFile | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    void fetch(`/api/leads/${id}/complete`, { credentials: "include" })
      .then((r) => r.json())
      .then((j: { data?: Complete }) => setC(j.data ?? null))
      .catch(() => undefined);
  }, [id, tick]);
  if (!c) return <p className="text-sm text-prime-muted">Carregando documentos…</p>;
  const missing = c.missing ?? [];
  if (!c.data && !c.files.length)
    return (
      <div className="rounded-xl border border-dashed border-prime-border bg-white p-3 text-sm text-prime-muted">
        Ele ainda não mandou nenhum documento. Use “Lembrar de terminar o cadastro” para cobrar.
      </div>
    );
  return (
    <div className={`grid gap-3 rounded-xl border p-3 ${c.data ? "border-[#BFE3CC] bg-[#F1FAF4]" : "border-[#D6E0EC] bg-[#F4F7FB]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={`text-sm font-semibold ${c.data ? "text-[#1F7A4C]" : "text-[#1B4E7A]"}`}>
          {c.data
            ? `✓ Cadastro completo enviado em ${c.completed_at ? when(c.completed_at) : "—"}`
            : `Ainda preenchendo · já mandou ${c.files.length} de ${c.files.length + missing.length} documentos`}
        </p>
        <button type="button" onClick={() => setTick((t) => t + 1)} className="text-xs font-semibold text-prime-gold-ink">
          ↻ Atualizar
        </button>
      </div>
      <DocsGallery files={c.files} missing={missing} onZoom={setZoom} />
      {c.data ? (
        <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          {C_LABEL.filter(([k]) => c.data![k] !== undefined && c.data![k] !== "" && !(Array.isArray(c.data![k]) && !(c.data![k] as unknown[]).length)).map(([k, l]) => (
            <div key={k}>
              <dt className="text-xs text-prime-muted">{l}</dt>
              <dd>{fmtVal(c.data![k])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p className="text-xs text-prime-muted">Por segurança, os links dos documentos valem 1 hora. Se expirar, toque em “Atualizar”.</p>
      {zoom ? (
        <div role="dialog" aria-modal="true" onClick={() => setZoom(null)} className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-black/85 p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom.url!} alt={SHORT[zoom.kind] ?? zoom.label} className="max-h-[80vh] max-w-full rounded-xl object-contain" />
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            <a href={zoom.url!} target="_blank" rel="noreferrer" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#111]">
              Abrir original
            </a>
            <button type="button" onClick={() => setZoom(null)} className="rounded-xl bg-[#111] px-4 py-2 text-sm font-semibold text-[#D9BC6A] ring-1 ring-white/30">
              Fechar
            </button>
          </div>
          <p className="text-sm font-semibold text-white">{SHORT[zoom.kind] ?? zoom.label}</p>
        </div>
      ) : null}
    </div>
  );
}

const STATUS: Record<Lead["status"], { label: string; cls: string }> = {
  novo: { label: "Novo", cls: "bg-[#FBF3E0] text-[#8A5A00]" },
  em_contato: { label: "Em contato", cls: "bg-[#EEF2F7] text-[#1B4E7A]" },
  aprovado: { label: "Aprovado", cls: "bg-[#EAF6EF] text-[#1F7A4C]" },
  descartado: { label: "Descartado", cls: "bg-[#F1EFEA] text-[#6F6A60]" }
};

const LABEL: Record<string, string> = {
  has_vehicle: "Tem carro",
  vehicle_model: "Modelo",
  vehicle_year: "Ano",
  vehicle_color: "Cor",
  cnh_ear: "CNH com EAR",
  experience: "Experiência",
  availability: "Disponibilidade",
  has_cnpj: "MEI/CNPJ",
  role: "Cargo",
  monthly_volume: "Volume por mês",
  notes: "Mensagem"
};
const VAL: Record<string, string> = {
  sim: "Sim",
  nao: "Não",
  em_andamento: "Em andamento",
  nenhuma: "Nenhuma",
  aplicativo: "Aplicativos (Uber/99)",
  executivo: "Transporte executivo",
  ambos: "Aplicativo e executivo",
  mei: "MEI",
  cnpj: "CNPJ"
};

const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

type Stage = "etapa1" | "etapa2" | "completo" | "aprovado" | "descartado";
const stageOf = (l: Lead): Stage =>
  l.status === "descartado" ? "descartado" : l.status === "aprovado" ? "aprovado" : l.completed_at ? "completo" : l.kind === "motorista" && l.complete_sent_at ? "etapa2" : "etapa1";
const STAGE: Record<Stage, { label: string; cls: string; hint: string }> = {
  etapa1: { label: "Novo", cls: "bg-[#FBF3E0] text-[#8A5A00]", hint: "Fez só o cadastro básico" },
  etapa2: { label: "Preenchendo", cls: "bg-[#EEF2F7] text-[#1B4E7A]", hint: "Começou o cadastro completo e ainda não terminou" },
  completo: { label: "Pronto p/ análise", cls: "bg-[#EAF6EF] text-[#1F7A4C]", hint: "Mandou documentos e dados. Falta você analisar" },
  aprovado: { label: "Aprovado", cls: "bg-[#111] text-[#D9BC6A]", hint: "Aprovado pela central" },
  descartado: { label: "Descartado", cls: "bg-[#F1EFEA] text-[#6F6A60]", hint: "Não segue" }
};
const initials = (n: string) =>
  n
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
const titleCase = (n: string) => n.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

function Progress({ l }: { l: Lead }) {
  const st = stageOf(l);
  const steps = l.kind === "motorista" ? ["Cadastro básico", "Cadastro completo", "Análise", "Aprovado"] : ["Cadastro", "Contato", "Proposta"];
  const at =
    l.kind === "motorista"
      ? st === "etapa1" ? 1 : st === "etapa2" ? 1 : st === "completo" ? 2 : st === "aprovado" ? 4 : 1
      : l.status === "novo" ? 1 : l.status === "em_contato" ? 2 : 3;
  return (
    <ol className="flex items-center gap-1.5" aria-label="Andamento">
      {steps.map((t, i) => (
        <li key={t} className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`h-1.5 rounded-full ${i < at ? "bg-[#C9A84C]" : "bg-[#ECE7DB]"}`} />
          <span className={`truncate text-[11px] ${i < at ? "font-semibold text-[#111]" : "text-prime-muted"}`}>{t}</span>
        </li>
      ))}
    </ol>
  );
}

export function SiteLeadsBoard() {
  const [kind, setKind] = useState<"motorista" | "empresa">("motorista");
  const [list, setList] = useState<Lead[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ativos" | Stage>("ativos");
  useEffect(() => {
    // Vindo do aviso do início: /cadastros-site?filtro=completo abre já no filtro certo.
    try {
      const f = new URLSearchParams(window.location.search).get("filtro");
      if (f && ["completo", "etapa2", "etapa1", "aprovado", "descartado"].includes(f)) setFilter(f as Stage);
    } catch {
      /* sem filtro */
    }
  }, []);
  const [q, setQ] = useState("");

  useEffect(() => {
    setList(null);
    setFilter("ativos");
    void fetch(`/api/leads?kind=${kind}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j: { data?: Lead[] }) => setList(j.data ?? []))
      .catch(() => setList([]));
  }, [kind]);

  async function sendComplete(l: Lead) {
    const r = await fetch(`/api/leads/${l.id}/complete-link`, { method: "POST", credentials: "include" }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { data?: { url: string } }) : {};
    if (!j.data?.url) {
      alert("Não foi possível gerar o link agora.");
      return;
    }
    const digits = l.phone.replace(/\D/g, "");
    const msg = `Olá ${titleCase(l.name.split(" ")[0])}, aqui é da Prime Vitória! Seu cadastro de motorista parceiro está quase pronto. Continue de onde parou por este link (leva uns 10 minutos):\n\n${j.data.url}\n\nTenha em mãos CNH, CRLV, comprovante de residência e a certidão de antecedentes criminais.`;
    setList((cur) => (cur ?? []).map((x) => (x.id === l.id ? { ...x, complete_sent_at: x.complete_sent_at ?? new Date().toISOString(), status: x.status === "novo" ? "em_contato" : x.status } : x)));
    window.open(`https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  async function save(id: string, patch: Partial<Pick<Lead, "status" | "notes">>) {
    setList((cur) => (cur ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await fetch("/api/leads", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) }).catch(() => undefined);
  }

  const all = list ?? [];
  const count = (st: Stage) => all.filter((l) => stageOf(l) === st).length;
  const shown = all
    .filter((l) => (filter === "ativos" ? !["descartado"].includes(stageOf(l)) : stageOf(l) === filter))
    .filter((l) => !q.trim() || `${l.name} ${l.phone} ${l.city ?? ""} ${l.company_name ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const chips: ["ativos" | Stage, string, number][] =
    kind === "motorista"
      ? [
          ["ativos", "Todos", all.filter((l) => stageOf(l) !== "descartado").length],
          ["completo", "Prontos p/ análise", count("completo")],
          ["etapa2", "Preenchendo", count("etapa2")],
          ["etapa1", "Só básico", count("etapa1")],
          ["aprovado", "Aprovados", count("aprovado")],
          ["descartado", "Descartados", count("descartado")]
        ]
      : [
          ["ativos", "Todas", all.filter((l) => stageOf(l) !== "descartado").length],
          ["etapa1", "Novas", count("etapa1")],
          ["aprovado", "Fechadas", count("aprovado")],
          ["descartado", "Descartadas", count("descartado")]
        ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-white p-1 ring-1 ring-prime-border">
          {(["motorista", "empresa"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${kind === k ? "bg-[#111] text-[#D9BC6A]" : "text-[#111]"}`}
            >
              {k === "motorista" ? "Motoristas" : "Empresas"}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nome, telefone ou cidade"
          className="min-w-0 flex-1 rounded-full border border-prime-border bg-white px-4 py-2 text-sm sm:max-w-xs"
        />
        <a href={kind === "motorista" ? "/seja-motorista" : "/para-empresas"} target="_blank" rel="noreferrer" className="text-sm font-semibold text-[#8A6A1F] underline">
          Ver a página ↗
        </a>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {chips.map(([k, t, n]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm ${filter === k ? "bg-[#111] font-semibold text-white" : "bg-white text-[#111] ring-1 ring-prime-border"}`}
          >
            {t} <span className={filter === k ? "text-[#D9BC6A]" : "text-prime-muted"}>{n}</span>
          </button>
        ))}
      </div>

      {!list ? <div className="h-32 animate-pulse rounded-2xl bg-white" /> : null}
      {list && !shown.length ? (
        <p className="rounded-2xl border border-dashed border-prime-border bg-white p-8 text-center text-sm text-prime-muted">
          {all.length ? "Nada neste filtro." : "Nenhum cadastro ainda. Quando alguém preencher a página, aparece aqui e no sininho."}
        </p>
      ) : null}

      <ul className="grid gap-3">
        {shown.map((l) => {
          const st = stageOf(l);
          const digits = l.phone.replace(/\D/g, "");
          const first = titleCase(l.name.split(" ")[0] ?? "");
          const wa = `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}?text=${encodeURIComponent(
            l.kind === "motorista"
              ? `Olá ${first}, aqui é da Prime Vitória. Recebemos seu cadastro para motorista parceiro. Podemos conversar?`
              : `Olá ${first}, aqui é da Prime Vitória. Recebemos o cadastro da ${l.company_name ?? "sua empresa"}. Podemos conversar sobre o transporte de vocês?`
          )}`;
          const isOpen = open === l.id;
          const facts = Object.entries(l.details).filter(([k, v]) => LABEL[k] && k !== "notes" && v !== "" && v != null);
          return (
            <li key={l.id} className={`overflow-hidden rounded-2xl border bg-white shadow-prime-card ${st === "completo" ? "border-[#BFE3CC]" : "border-prime-border"}`}>
              <button type="button" onClick={() => setOpen(isOpen ? null : l.id)} className="grid w-full gap-3 p-4 text-left">
                <span className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#111] text-sm font-semibold text-[#D9BC6A]">{initials(l.name)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-[#111]">{l.kind === "empresa" ? l.company_name : titleCase(l.name)}</span>
                    <span className="block truncate text-xs text-prime-muted">
                      {l.kind === "empresa" ? `${titleCase(l.name)} · ` : ""}
                      {when(l.created_at)}
                      {l.city ? ` · ${titleCase(l.city)}` : ""}
                      {l.kind === "motorista" && l.details.vehicle_model ? ` · ${titleCase(String(l.details.vehicle_model))} ${String(l.details.vehicle_year ?? "")}` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STAGE[st].cls}`} title={STAGE[st].hint}>
                    {STAGE[st].label}
                  </span>
                </span>
                <Progress l={l} />
              </button>
              {isOpen ? (
                <div className="grid gap-4 border-t border-prime-border bg-[#FCFBF8] p-4 text-sm">
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                    <a href={wa} target="_blank" rel="noreferrer" className="rounded-xl bg-[#1F7A4C] px-4 py-2.5 text-center font-semibold text-[#fff]">
                      WhatsApp
                    </a>
                    <a href={`tel:${l.phone}`} className="rounded-xl bg-white px-4 py-2.5 text-center font-semibold ring-1 ring-prime-border">
                      Ligar
                    </a>
                    {l.kind === "motorista" && !l.completed_at && st !== "descartado" ? (
                      <button type="button" onClick={() => void sendComplete(l)} className="col-span-2 rounded-xl bg-[#111] px-4 py-2.5 font-semibold text-[#D9BC6A] sm:col-span-1">
                        Lembrar de terminar o cadastro
                      </button>
                    ) : null}
                    {l.email ? (
                      <a href={`mailto:${l.email}`} className="col-span-2 truncate rounded-xl bg-white px-4 py-2.5 text-center ring-1 ring-prime-border sm:col-span-1">
                        {l.email}
                      </a>
                    ) : null}
                  </div>
                  <p className="text-xs text-prime-muted">
                    {STAGE[st].hint}
                    {st === "etapa2" && l.complete_sent_at ? ` (link aberto desde ${when(l.complete_sent_at)})` : ""}. Telefone {l.phone}.
                  </p>

                  {l.kind === "motorista" && (l.completed_at || l.complete_sent_at) ? <CompleteView id={l.id} /> : null}

                  {facts.length || l.use_cases?.length || l.company_size ? (
                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8A6A1F]">{l.completed_at ? "Cadastro básico" : "O que ele informou"}</p>
                      <div className="flex flex-wrap gap-2">
                        {l.kind === "empresa" && l.company_size ? <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-prime-border">Colaboradores: {l.company_size}</span> : null}
                        {l.use_cases?.length ? <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-prime-border">Interesse: {l.use_cases.join(", ")}</span> : null}
                        {facts.map(([k, v]) => (
                          <span key={k} className="rounded-full bg-white px-3 py-1.5 ring-1 ring-prime-border">
                            <span className="text-prime-muted">{LABEL[k]}:</span> {VAL[String(v)] ?? titleCase(String(v))}
                          </span>
                        ))}
                        {l.utm?.utm_source ? <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-prime-border">Veio de: {[l.utm.utm_source, l.utm.utm_campaign].filter(Boolean).join(" · ")}</span> : null}
                      </div>
                      {l.details.notes ? <p className="mt-2 whitespace-pre-line rounded-xl bg-white p-3 ring-1 ring-prime-border">{String(l.details.notes)}</p> : null}
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#8A6A1F]">Sua decisão</p>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      {(["em_contato", "aprovado", "descartado", "novo"] as Lead["status"][]).map((s2) => (
                        <button
                          key={s2}
                          type="button"
                          onClick={() => void save(l.id, { status: s2 })}
                          className={`rounded-xl px-3 py-2 text-sm font-semibold ${l.status === s2 ? (s2 === "aprovado" ? "bg-[#111] text-[#D9BC6A]" : `${STATUS[s2].cls} ring-1 ring-current`) : "bg-white ring-1 ring-prime-border"}`}
                        >
                          {s2 === "aprovado" ? "✓ Aprovar" : s2 === "descartado" ? "Descartar" : s2 === "em_contato" ? "Em conversa" : "Voltar a novo"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    defaultValue={l.notes ?? ""}
                    onBlur={(e) => e.target.value !== (l.notes ?? "") && void save(l.id, { notes: e.target.value })}
                    placeholder="Anotações (ex.: entrevista sexta 10h, carro vistoriado…)"
                    className="prime-input w-full text-sm"
                    rows={2}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
