"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Signer = { name: string; email?: string | null; status?: string; sign_url?: string | null; role?: string };
type Contract = { id: string; title: string; status: "pendente" | "assinado" | "recusado" | "cancelado"; created_at: string; signed_at: string | null; signers: Signer[]; sign_url: string | null; zapsign_token: string | null };
type Mode = "modelo" | "zapsign" | "link" | "arquivo";
type Field = { variable: string; value: string };
type SignerForm = { name: string; email: string; phone: string; role: string };

const STATUS: Record<Contract["status"], { label: string; cls: string }> = {
  pendente: { label: "Aguardando assinatura", cls: "bg-amber-100 text-amber-900" },
  assinado: { label: "Assinado", cls: "bg-emerald-100 text-emerald-800" },
  recusado: { label: "Recusado", cls: "bg-red-100 text-red-800" },
  cancelado: { label: "Cancelado", cls: "bg-slate-100 text-slate-600" }
};
const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");

/** Contratos de um motorista ou de um cliente: enviar para a ZapSign, acompanhar a situação, baixar. Sem <form> (fica dentro de outros formulários). */
export function ContractsSection(props: {
  driverId?: string;
  clientId?: string;
  party: { name: string; email?: string | null; phone?: string | null };
  /** Parte do nome do modelo para abrir já escolhido (ex.: "MOTORISTA"). */
  autoTemplate?: string;
}) {
  const q = props.driverId ? `driver_id=${props.driverId}` : `client_id=${props.clientId}`;
  const [list, setList] = useState<Contract[]>([]);
  const [open, setOpen] = useState(Boolean(props.autoTemplate));
  const boxRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>("modelo");
  const [templates, setTemplates] = useState<{ token: string; name: string }[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [fields, setFields] = useState<Field[]>([]);
  const [tplMsg, setTplMsg] = useState<string | null>(null);
  const [title, setTitle] = useState(props.driverId ? "Acordo de Motorista Parceiro" : "Contrato de Prestação de Serviços");
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [signers, setSigners] = useState<SignerForm[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const r = await fetchWithSupabaseSession(`/api/contracts?${q}`, {}, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (j?.success) setList(j.data as Contract[]);
  }, [q]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setSigners([
      { name: props.party.name, email: props.party.email ?? "", phone: props.party.phone ?? "", role: "parte" },
      { name: "Rubens", email: "contato@primevitoria.com", phone: "", role: "Prime Vitória" }
    ]);
  }, [props.party.name, props.party.email, props.party.phone]);

  useEffect(() => {
    if (!open || mode !== "modelo" || templates) return;
    void fetchWithSupabaseSession("/api/contracts/templates", {}, "admin")
      .then((r) => r.json())
      .then((j) => {
        if (j?.success) setTemplates(j.data);
        else {
          setTemplates([]);
          setTplMsg(j?.error?.message ?? "Não consegui ler os modelos da ZapSign.");
        }
      })
      .catch(() => setTemplates([]));
  }, [open, mode, templates]);

  // Link "Gerar contrato": escolhe o modelo sozinho e rola até o quadro.
  const autoDone = useRef(false);
  useEffect(() => {
    if (!props.autoTemplate || autoDone.current || !templates?.length) return;
    const t = templates.find((x) => x.name.toUpperCase().includes(props.autoTemplate!.toUpperCase()));
    if (!t) return;
    autoDone.current = true;
    void pickTemplate(t.token);
    window.setTimeout(() => boxRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, props.autoTemplate]);

  async function pickTemplate(token: string) {
    setTemplateId(token);
    setFields([]);
    setTplMsg(null);
    if (!token) return;
    const r = await fetchWithSupabaseSession(`/api/contracts/templates/${token}?${q}`, {}, "admin").catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    if (!j?.success) return setTplMsg(j?.error?.message ?? "Não consegui abrir o modelo.");
    setFields(j.data.fields as Field[]);
    if (j.data.name) setTitle(`${j.data.name} — ${props.party.name}`);
    const empty = (j.data.fields as Field[]).filter((f) => !f.value).length;
    setTplMsg(empty ? `${empty} campo(s) em branco: preencha abaixo (testemunhas, dados que faltam no cadastro).` : "Todos os campos preenchidos com o cadastro. Confira antes de enviar.");
  }

  async function upload(f: File): Promise<string | null> {
    const r = await fetchWithSupabaseSession("/api/contracts/upload-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ file_name: f.name, size: f.size }) }, "admin");
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j?.success) throw new Error(j?.error?.message ?? "Falha ao preparar o envio do PDF.");
    const put = await fetch(j.data.url, { method: "PUT", headers: { "Content-Type": "application/pdf" }, body: f });
    if (!put.ok) throw new Error("O PDF não subiu. Tente de novo.");
    return j.data.path as string;
  }

  async function save() {
    if (busy) return;
    setMsg(null);
    if ((mode === "zapsign" || mode === "arquivo") && !file) return setMsg({ ok: false, text: "Escolha o PDF do contrato." });
    if (mode === "modelo" && !templateId) return setMsg({ ok: false, text: "Escolha o modelo." });
    if (mode === "link" && !link.trim()) return setMsg({ ok: false, text: "Cole o link do documento na ZapSign." });
    const valid = signers.filter((s) => s.name.trim().length >= 2);
    if (mode === "zapsign" || mode === "modelo") {
      if (!valid.length) return setMsg({ ok: false, text: "Informe quem assina." });
      const noContact = valid.find((s) => !s.email.trim());
      if (noContact && !window.confirm(`${noContact.name} está sem e-mail: a ZapSign não vai mandar o link para ele. Você mesmo copia e envia o link depois. Continuar?`)) return;
    }
    setBusy(true);
    try {
      const file_path = file && (mode === "zapsign" || mode === "arquivo") ? await upload(file) : null;
      const r = await fetchWithSupabaseSession(
        "/api/contracts",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            driver_id: props.driverId ?? null,
            client_id: props.clientId ?? null,
            title,
            mode,
            file_path,
            link: mode === "link" ? link : null,
            template_id: mode === "modelo" ? templateId : null,
            fields:
              mode === "modelo"
                ? fields.map((f) => {
                    // Testemunhas: se o campo do nome ficou vazio, usa o nome de quem vai assinar como testemunha.
                    const m = f.variable.match(/TESTEMUNHA\s*_?(\d)\s*_?NOME/i);
                    if (f.value || !m) return f;
                    const w = valid.filter((x) => x.role === "Testemunha")[Number(m[1]) - 1];
                    return w ? { ...f, value: w.name.trim() } : f;
                  })
                : undefined,
            signers: mode === "zapsign" || mode === "modelo" ? valid.map((s) => ({ name: s.name.trim(), email: s.email.trim() || null, phone: s.phone.trim() || null, role: s.role })) : undefined
          })
        },
        "admin"
      );
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j?.success) throw new Error(j?.error?.message ?? "Não foi possível salvar.");
      setMsg({
        ok: true,
        text:
          mode === "zapsign" || mode === "modelo"
            ? `Enviado para a ZapSign. Quem tem e-mail recebe o link de assinatura${props.driverId ? "; o motorista também vê no app" : "; o gestor também vê no portal"}.`
            : mode === "link"
              ? "Documento da ZapSign ligado. A situação atualiza sozinha."
              : "Contrato assinado guardado."
      });
      setOpen(false);
      setFile(null);
      setLink("");
      void load();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Erro ao salvar." });
    }
    setBusy(false);
  }

  async function cancel(c: Contract) {
    if (!window.confirm(`Cancelar "${c.title}"? Ele deixa de aparecer como pendente. (Na ZapSign, cancele lá também se precisar.)`)) return;
    await fetchWithSupabaseSession(`/api/contracts/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "cancelado" }) }, "admin").catch(() => null);
    void load();
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMsg({ ok: true, text: "Link de assinatura copiado. Cole no WhatsApp da pessoa." });
    } catch {
      window.prompt("Copie o link:", url);
    }
  }

  const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm";
  return (
    <div
      ref={boxRef}
      className="grid scroll-mt-6 gap-3 rounded-xl border border-slate-200 bg-white p-4 md:col-span-2"
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
      }}
      onSubmit={(e) => e.stopPropagation()}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-slate-900">✍️ Contratos</p>
        <button type="button" onClick={() => setOpen((v) => !v)} className="rounded-lg bg-[#111] px-3 py-1.5 text-xs font-bold text-prime-gold">
          {open ? "Fechar" : "+ Novo contrato"}
        </button>
      </div>
      {msg ? <p className={`rounded-lg px-3 py-2 text-sm font-semibold text-[#fff] ${msg.ok ? "bg-emerald-600" : "bg-red-600"}`}>{msg.text}</p> : null}

      {open ? (
        <div className="grid gap-3 rounded-lg bg-slate-50 p-3">
          <div className="flex flex-wrap gap-2 text-xs">
            {(
              [
                ["modelo", "Usar meu modelo da ZapSign"],
                ["zapsign", "Enviar um PDF para assinar"],
                ["link", "Já está na ZapSign (colar link)"],
                ["arquivo", "Já assinado (só guardar o PDF)"]
              ] as [Mode, string][]
            ).map(([m, l]) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-full px-3 py-1.5 ${mode === m ? "bg-[#111] font-semibold text-[#fff]" : "border border-slate-300 bg-white"}`}>
                {l}
              </button>
            ))}
          </div>
          <label className="grid gap-1 text-sm">
            Nome do documento
            <input className={input} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {mode === "modelo" ? (
            <div className="grid gap-2">
              <label className="grid gap-1 text-sm">
                Modelo
                <select className={input} value={templateId} onChange={(e) => void pickTemplate(e.target.value)}>
                  <option value="">{templates === null ? "Carregando modelos…" : templates.length ? "Escolha o modelo" : "Nenhum modelo encontrado"}</option>
                  {(templates ?? []).map((t) => (
                    <option key={t.token} value={t.token}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              {tplMsg ? <p className="text-xs text-amber-800">{tplMsg}</p> : null}
              {fields.length ? (
                <div className="grid max-h-80 gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                  {fields.map((f, i) => (
                    <label key={f.variable} className="grid gap-0.5 text-xs sm:grid-cols-[200px_1fr] sm:items-center">
                      <span className="font-mono text-slate-500">{f.variable}</span>
                      <input
                        className={`${input} ${f.value ? "" : "border-amber-400 bg-amber-50"}`}
                        value={f.value}
                        onChange={(e) => setFields((l) => l.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : mode === "link" ? (
            <label className="grid gap-1 text-sm">
              Link do documento na ZapSign
              <input className={input} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://app.zapsign.com.br/verificar/…" />
            </label>
          ) : (
            <label className="grid gap-1 text-sm">
              PDF do contrato (até 15 MB)
              <input type="file" accept="application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" />
            </label>
          )}
          {mode === "zapsign" || mode === "modelo" ? (
            <div className="grid gap-2">
              <p className="text-sm font-medium">Quem assina</p>
              {signers.map((s, i) => (
                <div key={i} className="grid gap-2 rounded-lg border border-slate-200 bg-white p-2 sm:grid-cols-[1fr_1fr_140px_auto]">
                  <input className={input} placeholder="Nome" value={s.name} onChange={(e) => setSigners((l) => l.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
                  <input className={input} placeholder="E-mail (recebe o link)" value={s.email} onChange={(e) => setSigners((l) => l.map((x, k) => (k === i ? { ...x, email: e.target.value } : x)))} />
                  <input className={input} placeholder="Celular" value={s.phone} onChange={(e) => setSigners((l) => l.map((x, k) => (k === i ? { ...x, phone: e.target.value } : x)))} />
                  <button type="button" className="text-xs text-red-700" onClick={() => setSigners((l) => l.filter((_, k) => k !== i))}>
                    remover
                  </button>
                  <p className="text-[11px] text-slate-500 sm:col-span-4">{i === 0 ? (props.driverId ? "Motorista" : "Cliente") : s.role === "Prime Vitória" ? "Prime Vitória" : "Testemunha"}</p>
                </div>
              ))}
              {signers.length < 6 ? (
                <button type="button" className="justify-self-start text-xs font-semibold text-amber-800" onClick={() => setSigners((l) => [...l, { name: "", email: "", phone: "", role: "Testemunha" }])}>
                  + Testemunha
                </button>
              ) : null}
            </div>
          ) : null}
          <button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-[#111] py-2.5 text-sm font-bold text-prime-gold disabled:opacity-50">
            {busy ? "Enviando…" : mode === "zapsign" || mode === "modelo" ? "Enviar para assinatura" : "Salvar"}
          </button>
        </div>
      ) : null}

      {list.length === 0 ? <p className="text-sm text-slate-500">Nenhum contrato ainda.</p> : null}
      <ul className="grid gap-2">
        {list.map((c) => (
          <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium">{c.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS[c.status].cls}`}>{STATUS[c.status].label}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Criado em {fmt(c.created_at)}
              {c.signed_at ? ` · assinado em ${fmt(c.signed_at)}` : ""}
            </p>
            {c.signers?.length ? (
              <p className="mt-1 text-xs text-slate-600">
                {c.signers.map((s) => `${s.name} ${s.status === "signed" ? "✓" : "…"}`).join(" · ")}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <a href={`/api/contracts/${c.id}/file`} target="_blank" rel="noreferrer" className="font-semibold text-amber-800">
                {c.status === "assinado" ? "Baixar assinado" : "Ver PDF"}
              </a>
              {c.status === "pendente"
                ? c.signers
                    .filter((s) => s.status !== "signed" && s.sign_url)
                    .map((s) => (
                      <button key={s.sign_url as string} type="button" className="text-slate-700 underline" onClick={() => void copy(s.sign_url as string)}>
                        Copiar link de {s.name.split(" ")[0]}
                      </button>
                    ))
                : null}
              {c.status === "pendente" ? (
                <button type="button" className="text-red-700" onClick={() => void cancel(c)}>
                  Cancelar
                </button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
