"use client";

import { useEffect, useMemo, useState } from "react";
import { CNH_CATEGORIES, DECLARATIONS, EXPERIENCE_TIME, LANGS, PIX_TYPES, SERVICES, SIGNUP_FILES, UFS, onlyDigits, validCpf, type SignupFileKind } from "@/lib/drivers/driver-signup-fields";

type V = Record<string, string>;
type Prefill = { name: string; phone: string; email: string | null; city: string | null; vehicle_model?: string; vehicle_year?: string; vehicle_color?: string };

const field = "w-full rounded-2xl border border-[#E2DCCD] bg-white px-4 py-3.5 text-base text-[#111] outline-none transition focus:border-[#A8873A] focus:ring-2 focus:ring-[#D9BC6A]/40";
const lbl = "mb-1.5 block text-sm font-semibold text-[#111]";

const STEPS = ["Seus dados", "Habilitação", "Perfil profissional", "Veículo", "Documentos", "Pagamento", "Emergência", "Declarações"] as const;

const mask = {
  cpf: (v: string) => onlyDigits(v).slice(0, 11).replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2"),
  cnpj: (v: string) => onlyDigits(v).slice(0, 14).replace(/^(\d{2})(\d)/, "$1.$2").replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1/$2").replace(/(\d{4})(\d)/, "$1-$2"),
  phone: (v: string) => {
    const d = onlyDigits(v).slice(0, 11);
    if (d.length <= 2) return d ? `(${d}` : "";
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
  },
  cep: (v: string) => onlyDigits(v).slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2"),
  plate: (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7)
};

function Pills({ options, value, onPick, multi }: { options: { v: string; l: string }[]; value: string | string[]; onPick: (v: string) => void; multi?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = multi ? (value as string[]).includes(o.v) : value === o.v;
        return (
          <button
            key={o.v}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(o.v)}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${on ? "border-[#111] bg-[#111] text-[#D9BC6A]" : "border-[#E2DCCD] bg-white text-[#111]"}`}
          >
            {multi && on ? "✓ " : ""}
            {o.l}
          </button>
        );
      })}
    </div>
  );
}
const YN = [
  { v: "sim", l: "Sim" },
  { v: "nao", l: "Não" }
];

/** Cadastro completo do motorista (etapa 2), aberto pelo link que a central envia. */
export function DriverSignupForm({ token, prefill }: { token: string; prefill: Prefill }) {
  const KEY = `pv-cadastro-${token.slice(0, 10)}`;
  const [step, setStep] = useState(0);
  const [v, setV] = useState<V>({
    full_name: prefill.name,
    phone: mask.phone(prefill.phone),
    email: prefill.email ?? "",
    city: (prefill.city ?? "").split("/")[0] ?? "",
    vehicle_model: prefill.vehicle_model ?? "",
    vehicle_year: prefill.vehicle_year ?? "",
    vehicle_color: prefill.vehicle_color ?? ""
  });
  const [multi, setMulti] = useState<Record<string, string[]>>({ states: ["ES"], languages: ["Português"], services: [] });
  const [files, setFiles] = useState<Record<string, { path: string; name: string }>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [decl, setDecl] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  // Rascunho no próprio celular: se fechar a página, continua de onde parou.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw) as { v?: V; multi?: Record<string, string[]>; files?: typeof files; step?: number };
        if (d.v) setV((cur) => ({ ...cur, ...d.v }));
        if (d.multi) setMulti((cur) => ({ ...cur, ...d.multi }));
        if (d.files) setFiles(d.files);
        if (typeof d.step === "number") setStep(Math.min(d.step, STEPS.length - 1));
      }
    } catch {
      /* sem rascunho */
    }
  }, [KEY]);
  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ v, multi, files, step }));
    } catch {
      /* sem armazenamento */
    }
  }, [KEY, v, multi, files, step]);

  // Também manda o progresso para a central (a cada pausa de 4 s), para ela ver onde o motorista parou.
  useEffect(() => {
    if (done) return;
    const id = window.setTimeout(() => {
      void fetch(`/api/public/driver-signup/${token}/draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step, data: { ...v, ...multi } }),
        keepalive: true
      }).catch(() => undefined);
    }, 4000);
    return () => window.clearTimeout(id);
  }, [token, v, multi, step, done]);

  const set = (k: string, m?: (x: string) => string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const x = m ? m(e.target.value) : e.target.value;
    setV((cur) => ({ ...cur, [k]: x }));
  };
  const pick = (k: string) => (x: string) => setV((cur) => ({ ...cur, [k]: x }));
  const toggle = (k: string) => (x: string) => setMulti((cur) => ({ ...cur, [k]: (cur[k] ?? []).includes(x) ? cur[k]!.filter((y) => y !== x) : [...(cur[k] ?? []), x] }));

  async function lookupCep(cep: string) {
    const d = onlyDigits(cep);
    if (d.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = (await r.json()) as { logradouro?: string; bairro?: string; localidade?: string; uf?: string; erro?: boolean };
      if (j.erro) return;
      setV((cur) => ({ ...cur, street: cur.street || j.logradouro || "", district: cur.district || j.bairro || "", city: j.localidade || cur.city || "", uf: j.uf || cur.uf || "" }));
    } catch {
      /* preenche à mão */
    }
  }

  async function upload(kind: SignupFileKind, file: File) {
    setErr(null);
    if (file.size > 10 * 1024 * 1024) {
      setErr("Arquivo maior que 10 MB. Tire uma foto com menos resolução ou envie o PDF.");
      return;
    }
    setUploading(kind);
    try {
      const u = await fetch(`/api/public/driver-signup/${token}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, file_name: file.name, size: file.size, type: file.type })
      });
      const uj = (await u.json().catch(() => ({}))) as { success?: boolean; data?: { path: string; url: string }; error?: { message?: string } };
      if (!u.ok || !uj.data) throw new Error(uj.error?.message ?? "Não foi possível enviar.");
      const put = await fetch(uj.data.url, { method: "PUT", body: file, headers: { "Content-Type": file.type || "application/octet-stream", "x-upsert": "false" } });
      if (!put.ok) throw new Error("O arquivo não subiu. Confira a internet e tente de novo.");
      setFiles((cur) => ({ ...cur, [kind]: { path: uj.data!.path, name: file.name } }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setUploading(null);
    }
  }

  const need = (k: string) => !(v[k] ?? "").trim();
  function checkStep(i: number): string | null {
    switch (i) {
      case 0:
        if ((v.full_name ?? "").trim().split(/\s+/).length < 2) return "Escreva seu nome completo.";
        if (!validCpf(v.cpf)) return "Confira o CPF.";
        if (need("birth_date")) return "Informe a data de nascimento.";
        if (onlyDigits(v.phone).length < 10) return "Informe o celular com DDD.";
        if (!/^\S+@\S+\.\S+$/.test(v.email ?? "")) return "Informe um e-mail válido.";
        if (onlyDigits(v.cep).length !== 8 || need("street") || need("number") || need("district") || need("city") || need("uf")) return "Complete o endereço (CEP, rua, número, bairro, cidade e estado).";
        return null;
      case 1:
        if (onlyDigits(v.cnh_number).length < 9) return "Informe o número da CNH.";
        if (need("cnh_category")) return "Escolha a categoria da CNH.";
        if (need("cnh_expires_at")) return "Informe a validade da CNH.";
        if (need("cnh_ear")) return "Diga se a CNH tem EAR.";
        return null;
      case 2:
        if (need("bond")) return "Escolha o tipo de vínculo.";
        if (v.bond !== "autonomo" && onlyDigits(v.cnpj).length !== 14) return "Informe o CNPJ.";
        if (need("issues_invoice")) return "Diga se emite nota fiscal.";
        if (!(multi.states ?? []).length) return "Escolha os estados em que atua.";
        if (need("exec_experience")) return "Diga se tem experiência com transporte executivo.";
        if (!(multi.languages ?? []).length) return "Escolha os idiomas que fala.";
        if (need("formal_attire")) return "Diga se tem traje social completo.";
        return null;
      case 3:
        if (need("vehicle_model")) return "Informe marca e modelo do veículo.";
        if (!/^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(v.vehicle_plate ?? "")) return "Confira a placa.";
        if (need("insured")) return "Diga se o veículo tem seguro.";
        return null;
      case 4: {
        const miss = SIGNUP_FILES.find((f) => (f.required || (f.kind === "apolice_seguro" && v.insured === "sim")) && !files[f.kind]);
        return miss ? `Falta enviar: ${miss.label}.` : null;
      }
      case 5:
        if (need("pix_type") || need("pix_key")) return "Informe o tipo e a chave PIX.";
        if (need("bank_account")) return "Informe banco, agência e conta.";
        return null;
      case 6:
        if ((v.emergency_name ?? "").trim().split(/\s+/).length < 2) return "Nome completo do contato de emergência.";
        if (onlyDigits(v.emergency_phone).length < 10) return "Telefone do contato de emergência.";
        if (!validCpf(v.emergency_cpf)) return "Confira o CPF do contato de emergência.";
        if (!/^\S+@\S+\.\S+$/.test(v.emergency_email ?? "")) return "E-mail do contato de emergência.";
        if (need("emergency_relation")) return "Informe o parentesco.";
        if (need("witness_ok")) return "Responda sobre a testemunha contratual.";
        return null;
      case 7:
        return DECLARATIONS.every((d) => decl[d.key]) ? null : "Marque todas as declarações para enviar.";
    }
    return null;
  }

  function next() {
    const p = checkStep(step);
    if (p) {
      setErr(p);
      return;
    }
    setErr(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function submit() {
    for (let i = 0; i < STEPS.length; i++) {
      const p = checkStep(i);
      if (p) {
        setStep(i);
        setErr(p);
        return;
      }
    }
    setBusy(true);
    setErr(null);
    const data = { ...v, ...multi };
    const body = {
      data,
      files: Object.fromEntries(Object.entries(files).map(([k, f]) => [k, f.path])),
      declarations: Object.fromEntries(DECLARATIONS.map((d) => [d.key, true]))
    };
    const r = await fetch(`/api/public/driver-signup/${token}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } }) : {};
    setBusy(false);
    if (!r?.ok || !j.success) {
      setErr(j.error?.message?.replace(/^Dados inválidos — /, "Confira: ") ?? "Não conseguimos enviar agora. Tente de novo.");
      return;
    }
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ok */
    }
    setDone(true);
    window.scrollTo({ top: 0 });
  }

  const progress = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step]);

  if (done)
    return (
      <div className="rounded-[28px] bg-white p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#111] text-2xl text-[#D9BC6A]">✓</span>
        <h2 className="mt-4 font-prime-serif text-2xl" style={{ color: "#111" }}>
          Cadastro enviado!
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6F6A60]">A central vai analisar seus documentos e falar com você pelo WhatsApp sobre a vistoria e o contrato.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="rounded-[22px] bg-white p-4 shadow-[0_6px_20px_rgba(0,0,0,0.05)]">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-[#111]">
            {step + 1}. {STEPS[step]}
          </span>
          <span className="text-[#6F6A60]">
            Etapa {step + 1} de {STEPS.length}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#F1EDE3]">
          <div className="h-full rounded-full bg-[#D9BC6A] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-4 rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] sm:p-8">
        {step === 0 ? (
          <>
            <div>
              <label className={lbl}>Nome completo</label>
              <input className={field} autoComplete="name" value={v.full_name ?? ""} onChange={set("full_name")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={lbl}>CPF</label>
                <input className={field} inputMode="numeric" value={v.cpf ?? ""} onChange={set("cpf", mask.cpf)} placeholder="000.000.000-00" />
              </div>
              <div>
                <label className={lbl}>RG (opcional)</label>
                <input className={field} value={v.rg ?? ""} onChange={set("rg")} />
              </div>
              <div>
                <label className={lbl}>Nascimento</label>
                <input className={field} type="date" value={v.birth_date ?? ""} onChange={set("birth_date")} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={lbl}>Celular (WhatsApp)</label>
                <input className={field} inputMode="tel" value={v.phone ?? ""} onChange={set("phone", mask.phone)} />
              </div>
              <div>
                <label className={lbl}>E-mail</label>
                <input className={field} type="email" autoComplete="email" value={v.email ?? ""} onChange={set("email")} />
              </div>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-3">
              <div>
                <label className={lbl}>CEP</label>
                <input className={field} inputMode="numeric" value={v.cep ?? ""} onChange={set("cep", mask.cep)} onBlur={(e) => void lookupCep(e.target.value)} placeholder="29000-000" />
              </div>
              <div>
                <label className={lbl}>Rua</label>
                <input className={field} autoComplete="address-line1" value={v.street ?? ""} onChange={set("street")} />
              </div>
            </div>
            <div className="grid grid-cols-[110px_1fr] gap-3">
              <div>
                <label className={lbl}>Número</label>
                <input className={field} value={v.number ?? ""} onChange={set("number")} />
              </div>
              <div>
                <label className={lbl}>Complemento</label>
                <input className={field} value={v.complement ?? ""} onChange={set("complement")} />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_1fr_90px] gap-3">
              <div>
                <label className={lbl}>Bairro</label>
                <input className={field} value={v.district ?? ""} onChange={set("district")} />
              </div>
              <div>
                <label className={lbl}>Cidade</label>
                <input className={field} value={v.city ?? ""} onChange={set("city")} />
              </div>
              <div>
                <label className={lbl}>UF</label>
                <select className={field} value={v.uf ?? ""} onChange={set("uf")}>
                  <option value="" />
                  {UFS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={lbl}>Número da CNH</label>
                <input className={field} inputMode="numeric" value={v.cnh_number ?? ""} onChange={set("cnh_number", (x) => onlyDigits(x).slice(0, 12))} />
              </div>
              <div>
                <label className={lbl}>Validade da CNH</label>
                <input className={field} type="date" value={v.cnh_expires_at ?? ""} onChange={set("cnh_expires_at")} />
              </div>
            </div>
            <div>
              <label className={lbl}>Data da primeira habilitação (opcional)</label>
              <input className={field} type="date" value={v.cnh_first_date ?? ""} onChange={set("cnh_first_date")} />
            </div>
            <div>
              <span className={lbl}>Categoria da CNH</span>
              <Pills options={CNH_CATEGORIES.map((c) => ({ v: c, l: c }))} value={v.cnh_category ?? ""} onPick={pick("cnh_category")} />
            </div>
            <div>
              <span className={lbl}>Sua CNH possui EAR (exerce atividade remunerada)?</span>
              <Pills options={YN} value={v.cnh_ear ?? ""} onPick={pick("cnh_ear")} />
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div>
              <span className={lbl}>Tipo de vínculo profissional</span>
              <Pills
                options={[
                  { v: "autonomo", l: "Pessoa física / autônomo" },
                  { v: "mei", l: "MEI" },
                  { v: "pj", l: "Pessoa jurídica" }
                ]}
                value={v.bond ?? ""}
                onPick={pick("bond")}
              />
            </div>
            {v.bond && v.bond !== "autonomo" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={lbl}>Razão social</label>
                  <input className={field} value={v.company_name ?? ""} onChange={set("company_name")} />
                </div>
                <div>
                  <label className={lbl}>CNPJ</label>
                  <input className={field} inputMode="numeric" value={v.cnpj ?? ""} onChange={set("cnpj", mask.cnpj)} />
                </div>
              </div>
            ) : null}
            <div>
              <span className={lbl}>Emite nota fiscal?</span>
              <Pills options={YN} value={v.issues_invoice ?? ""} onPick={pick("issues_invoice")} />
            </div>
            <div>
              <span className={lbl}>Em quais estados atua?</span>
              <Pills options={UFS.map((u) => ({ v: u, l: u }))} value={multi.states ?? []} onPick={toggle("states")} multi />
            </div>
            <div>
              <label className={lbl}>Cidades ou regiões que costuma atender (opcional)</label>
              <input className={field} value={v.regions ?? ""} onChange={set("regions")} placeholder="Ex.: Grande Vitória, Guarapari, Linhares" />
            </div>
            <div>
              <span className={lbl}>Possui experiência com transporte executivo?</span>
              <Pills options={YN} value={v.exec_experience ?? ""} onPick={pick("exec_experience")} />
            </div>
            <div>
              <span className={lbl}>Há quanto tempo trabalha com transporte de passageiros?</span>
              <Pills options={EXPERIENCE_TIME.map((x) => ({ v: x, l: x }))} value={v.experience_time ?? ""} onPick={pick("experience_time")} />
            </div>
            <div>
              <span className={lbl}>Quais idiomas fala?</span>
              <Pills options={LANGS.map((x) => ({ v: x, l: x }))} value={multi.languages ?? []} onPick={toggle("languages")} multi />
              <input className={`${field} mt-2`} value={v.languages_other ?? ""} onChange={set("languages_other")} placeholder="Outro idioma (opcional)" />
            </div>
            <div>
              <span className={lbl}>Possui traje social completo para atendimento executivo?</span>
              <Pills options={YN} value={v.formal_attire ?? ""} onPick={pick("formal_attire")} />
            </div>
            <div>
              <span className={lbl}>Quais serviços tem interesse em fazer? (opcional)</span>
              <Pills options={SERVICES.map((x) => ({ v: x, l: x }))} value={multi.services ?? []} onPick={toggle("services")} multi />
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={lbl}>Marca e modelo</label>
                <input className={field} value={v.vehicle_model ?? ""} onChange={set("vehicle_model")} placeholder="Ex.: Toyota Corolla" />
              </div>
              <div>
                <label className={lbl}>Placa</label>
                <input className={field} value={v.vehicle_plate ?? ""} onChange={set("vehicle_plate", mask.plate)} placeholder="ABC1D23" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Ano de fabricação</label>
                <input className={field} inputMode="numeric" maxLength={4} value={v.vehicle_year ?? ""} onChange={set("vehicle_year", (x) => onlyDigits(x).slice(0, 4))} />
              </div>
              <div>
                <label className={lbl}>Cor</label>
                <input className={field} value={v.vehicle_color ?? ""} onChange={set("vehicle_color")} />
              </div>
            </div>
            <div>
              <span className={lbl}>O veículo possui seguro?</span>
              <Pills options={YN} value={v.insured ?? ""} onPick={pick("insured")} />
            </div>
            {v.insured === "sim" ? (
              <>
                <div>
                  <span className={lbl}>O seguro tem cobertura APP (Acidentes Pessoais de Passageiros)?</span>
                  <Pills options={YN} value={v.insurance_app ?? ""} onPick={pick("insurance_app")} />
                </div>
                <div>
                  <span className={lbl}>O seguro tem cobertura RCF-V (Responsabilidade Civil Facultativa)?</span>
                  <Pills options={YN} value={v.insurance_rcfv ?? ""} onPick={pick("insurance_rcfv")} />
                </div>
              </>
            ) : null}
            <div>
              <label className={lbl}>Possui outro veículo que gostaria de cadastrar? (opcional)</label>
              <input className={field} value={v.other_vehicle ?? ""} onChange={set("other_vehicle")} placeholder="Modelo, ano e placa" />
            </div>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <p className="text-sm text-[#6F6A60]">Tire as fotos com boa luz. Os arquivos ficam guardados em área privada, só a central da Prime acessa.</p>
            {SIGNUP_FILES.filter((f) => f.kind !== "apolice_seguro" || v.insured === "sim").map((f) => {
              const got = files[f.kind];
              return (
                <div key={f.kind} className={`rounded-2xl border p-4 ${got ? "border-[#BFE3CC] bg-[#F1FAF4]" : "border-[#E2DCCD]"}`}>
                  <p className="text-sm font-semibold text-[#111]">
                    {got ? "✓ " : ""}
                    {f.label}
                    {f.required || f.kind === "apolice_seguro" ? "" : " (opcional)"}
                  </p>
                  {f.hint ? <p className="mt-0.5 text-xs text-[#6F6A60]">{f.hint}</p> : null}
                  {got ? <p className="mt-1 truncate text-xs text-[#1F7A4C]">{got.name}</p> : null}
                  <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#D9BC6A]">
                    {uploading === f.kind ? "Enviando…" : got ? "Trocar arquivo" : "Enviar arquivo"}
                    <input
                      type="file"
                      accept={f.accept}
                      className="sr-only"
                      disabled={uploading !== null}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void upload(f.kind, file);
                      }}
                    />
                  </label>
                </div>
              );
            })}
            <div>
              <label className={lbl}>Data de emissão da certidão de antecedentes (opcional)</label>
              <input className={field} type="date" value={v.criminal_record_date ?? ""} onChange={set("criminal_record_date")} />
            </div>
          </>
        ) : null}

        {step === 5 ? (
          <>
            <div>
              <span className={lbl}>Tipo da chave PIX</span>
              <Pills options={PIX_TYPES.map((x) => ({ v: x, l: x }))} value={v.pix_type ?? ""} onPick={pick("pix_type")} />
            </div>
            <div>
              <label className={lbl}>Chave PIX</label>
              <input className={field} value={v.pix_key ?? ""} onChange={set("pix_key")} />
            </div>
            <div>
              <label className={lbl}>Banco / Agência / Conta</label>
              <input className={field} value={v.bank_account ?? ""} onChange={set("bank_account")} placeholder="Ex.: Nubank · Ag. 0001 · CC 12345-6" />
            </div>
            <div>
              <label className={lbl}>Nome do titular da conta (se não for você)</label>
              <input className={field} value={v.account_holder ?? ""} onChange={set("account_holder")} />
            </div>
          </>
        ) : null}

        {step === 6 ? (
          <>
            <div>
              <label className={lbl}>Nome completo do contato de emergência</label>
              <input className={field} value={v.emergency_name ?? ""} onChange={set("emergency_name")} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={lbl}>Telefone</label>
                <input className={field} inputMode="tel" value={v.emergency_phone ?? ""} onChange={set("emergency_phone", mask.phone)} />
              </div>
              <div>
                <label className={lbl}>CPF</label>
                <input className={field} inputMode="numeric" value={v.emergency_cpf ?? ""} onChange={set("emergency_cpf", mask.cpf)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={lbl}>E-mail</label>
                <input className={field} type="email" value={v.emergency_email ?? ""} onChange={set("emergency_email")} />
              </div>
              <div>
                <label className={lbl}>Parentesco</label>
                <input className={field} value={v.emergency_relation ?? ""} onChange={set("emergency_relation")} placeholder="Ex.: esposa, irmão" />
              </div>
            </div>
            <div className="rounded-2xl bg-[#F7F5F0] p-4">
              <p className="text-sm font-semibold text-[#111]">Indicação de testemunha contratual</p>
              <p className="mt-1 text-sm text-[#6F6A60]">Essa pessoa poderá ser contatada pela Prime Vitória para ser convidada a atuar como testemunha na assinatura eletrônica do seu contrato. Ela concorda?</p>
              <div className="mt-3">
                <Pills options={YN} value={v.witness_ok ?? ""} onPick={pick("witness_ok")} />
              </div>
            </div>
          </>
        ) : null}

        {step === 7 ? (
          <>
            <div className="space-y-3 rounded-2xl bg-[#F7F5F0] p-4 text-sm leading-relaxed text-[#3B3E44]">
              <p className="font-semibold text-[#111]">Proteção de dados e declarações</p>
              <p>
                Os dados pessoais, documentos, informações bancárias, de habilitação e do veículo fornecidos neste formulário serão utilizados pela <b>Prime Vitória – Transporte Executivo</b> para cadastro, análise documental, formalização contratual, execução de serviços, pagamentos, controle operacional e cumprimento de obrigações legais e contratuais.
              </p>
              <p>Essas informações ficam armazenadas nos sistemas internos da empresa, inclusive em plataformas de gestão e nuvem, com acesso restrito às pessoas responsáveis pela administração e operação dos serviços, e serão mantidas pelo período necessário ao cumprimento de obrigações contratuais, operacionais e legais.</p>
              <p>
                O envio deste cadastro <b>não cria vínculo empregatício, não garante contratação e não assegura quantidade mínima de serviços</b>.
              </p>
            </div>
            {DECLARATIONS.map((d) => (
              <label key={d.key} className="flex items-start gap-3 text-sm text-[#111]">
                <input type="checkbox" checked={!!decl[d.key]} onChange={(e) => setDecl((cur) => ({ ...cur, [d.key]: e.target.checked }))} className="mt-0.5 h-5 w-5 shrink-0 accent-[#111]" />
                <span>{d.label}</span>
              </label>
            ))}
          </>
        ) : null}

        {err ? <p className="rounded-2xl bg-[#FCEDEA] px-4 py-3 text-sm font-semibold text-[#A3321F]">{err}</p> : null}

        <div className="flex gap-3 pt-2">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => {
                setErr(null);
                setStep((s) => s - 1);
              }}
              className="rounded-full border border-[#E2DCCD] px-6 py-4 font-semibold text-[#111]"
            >
              Voltar
            </button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={next} disabled={uploading !== null} className="flex-1 rounded-full bg-[#111] px-6 py-4 font-semibold text-[#D9BC6A] disabled:opacity-60">
              Continuar
            </button>
          ) : (
            <button type="button" onClick={() => void submit()} disabled={busy} className="flex-1 rounded-full bg-[#111] px-6 py-4 font-semibold text-[#D9BC6A] disabled:opacity-60">
              {busy ? "Enviando…" : "Enviar cadastro"}
            </button>
          )}
        </div>
        <p className="text-center text-xs text-[#A09A8E]">Seu progresso fica salvo neste celular. Pode fechar e voltar pelo mesmo link.</p>
      </div>
    </div>
  );
}
