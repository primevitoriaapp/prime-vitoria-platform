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
};

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

export function SiteLeadsBoard() {
  const [kind, setKind] = useState<"motorista" | "empresa">("motorista");
  const [list, setList] = useState<Lead[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    setList(null);
    void fetch(`/api/leads?kind=${kind}`, { credentials: "include" })
      .then((r) => r.json())
      .then((j: { data?: Lead[] }) => setList(j.data ?? []))
      .catch(() => setList([]));
  }, [kind]);

  async function save(id: string, patch: Partial<Pick<Lead, "status" | "notes">>) {
    setList((cur) => (cur ?? []).map((l) => (l.id === id ? { ...l, ...patch } : l)));
    await fetch("/api/leads", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...patch }) }).catch(() => undefined);
  }

  const novos = (list ?? []).filter((l) => l.status === "novo").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["motorista", "empresa"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${kind === k ? "bg-[#111] text-[#D9BC6A]" : "border border-prime-border bg-white"}`}
          >
            {k === "motorista" ? "Motoristas" : "Empresas"}
          </button>
        ))}
        {list && novos ? <span className="text-sm text-prime-muted">{novos} novo(s) para responder</span> : null}
        <a href={kind === "motorista" ? "/seja-motorista" : "/para-empresas"} target="_blank" rel="noreferrer" className="ml-auto text-sm font-semibold text-[#8A6A1F] underline">
          Ver a página
        </a>
      </div>

      {!list ? <div className="h-32 animate-pulse rounded-2xl bg-white" /> : null}
      {list && !list.length ? (
        <p className="rounded-2xl border border-prime-border bg-white p-6 text-center text-sm text-prime-muted">Nenhum cadastro ainda. Quando alguém preencher a página, aparece aqui e você recebe um aviso no celular.</p>
      ) : null}

      <ul className="space-y-2">
        {(list ?? []).map((l) => {
          const digits = l.phone.replace(/\D/g, "");
          const wa = `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}?text=${encodeURIComponent(
            l.kind === "motorista"
              ? `Olá ${l.name.split(" ")[0]}, aqui é da Prime Vitória. Recebemos seu cadastro para motorista parceiro. Podemos conversar?`
              : `Olá ${l.name.split(" ")[0]}, aqui é da Prime Vitória. Recebemos o cadastro da ${l.company_name ?? "sua empresa"}. Podemos conversar sobre o transporte de vocês?`
          )}`;
          const isOpen = open === l.id;
          return (
            <li key={l.id} className="rounded-2xl border border-prime-border bg-white shadow-prime-card">
              <button type="button" onClick={() => setOpen(isOpen ? null : l.id)} className="flex w-full items-center gap-3 p-4 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{l.kind === "empresa" ? `${l.company_name} · ${l.name}` : l.name}</span>
                  <span className="block truncate text-xs text-prime-muted">
                    {when(l.created_at)}
                    {l.city ? ` · ${l.city}` : ""}
                    {l.kind === "motorista" && l.details.vehicle_model ? ` · ${String(l.details.vehicle_model)} ${String(l.details.vehicle_year ?? "")}` : ""}
                    {l.kind === "empresa" && l.segment ? ` · ${l.segment}` : ""}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS[l.status].cls}`}>{STATUS[l.status].label}</span>
              </button>
              {isOpen ? (
                <div className="space-y-3 border-t border-prime-border p-4 text-sm">
                  <div className="flex flex-wrap gap-2">
                    <a href={wa} target="_blank" rel="noreferrer" className="rounded-full bg-[#1F7A4C] px-4 py-2 font-semibold text-white">
                      Chamar no WhatsApp
                    </a>
                    <a href={`tel:${l.phone}`} className="rounded-full border border-prime-border px-4 py-2 font-semibold">
                      Ligar {l.phone}
                    </a>
                    {l.email ? (
                      <a href={`mailto:${l.email}`} className="rounded-full border border-prime-border px-4 py-2 font-semibold">
                        {l.email}
                      </a>
                    ) : null}
                  </div>
                  <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    {l.kind === "empresa" && l.company_size ? (
                      <div>
                        <dt className="text-xs text-prime-muted">Colaboradores</dt>
                        <dd>{l.company_size}</dd>
                      </div>
                    ) : null}
                    {l.use_cases?.length ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs text-prime-muted">Interesse</dt>
                        <dd>{l.use_cases.join(" · ")}</dd>
                      </div>
                    ) : null}
                    {Object.entries(l.details)
                      .filter(([k, v]) => LABEL[k] && v !== "" && v != null && !["company_name", "segment", "company_size", "use_cases"].includes(k))
                      .map(([k, v]) => (
                        <div key={k} className={k === "notes" ? "sm:col-span-2" : ""}>
                          <dt className="text-xs text-prime-muted">{LABEL[k]}</dt>
                          <dd className="whitespace-pre-line">{VAL[String(v)] ?? String(v)}</dd>
                        </div>
                      ))}
                    {l.utm?.utm_source ? (
                      <div>
                        <dt className="text-xs text-prime-muted">Veio de</dt>
                        <dd>{[l.utm.utm_source, l.utm.utm_campaign].filter(Boolean).join(" · ")}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(STATUS) as Lead["status"][]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => void save(l.id, { status: s })}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold ${l.status === s ? STATUS[s].cls + " ring-1 ring-current" : "border border-prime-border"}`}
                      >
                        {STATUS[s].label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    defaultValue={l.notes ?? ""}
                    onBlur={(e) => e.target.value !== (l.notes ?? "") && void save(l.id, { notes: e.target.value })}
                    placeholder="Anotações (ex.: agendado conversa sexta 10h)"
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
