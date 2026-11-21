"use client";

import { useEffect, useState } from "react";

type Kind = "motorista" | "empresa";

const field = "w-full rounded-2xl border border-[#E2DCCD] bg-white px-4 py-3.5 text-base text-[#111] outline-none transition focus:border-[#A8873A] focus:ring-2 focus:ring-[#D9BC6A]/40";
const labelCls = "mb-1.5 block text-sm font-semibold text-[#111]";

const USE_CASES = ["Transfer aeroporto", "Rotas de funcionários", "Eventos e convenções", "Carro à disposição (diária)", "Visitantes e clientes VIP", "Veículo blindado", "Viagens intermunicipais"];
const SEGMENTS = ["Indústria", "Comércio / Varejo", "Logística / Comex", "Saúde", "Educação", "Tecnologia", "Serviços / Consultoria", "Órgão público", "Eventos / Turismo", "Outro"];
const SIZES = ["1 a 10", "11 a 50", "51 a 200", "201 a 500", "Mais de 500"];
const VOLUMES = ["Até 10 corridas", "11 a 50 corridas", "51 a 200 corridas", "Mais de 200 corridas", "Ainda não sei"];

function maskPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d ? `(${d}` : "";
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}`;
}

function Choice({ name, value, current, onPick, children }: { name: string; value: string; current: string; onPick: (v: string) => void; children: React.ReactNode }) {
  const on = current === value;
  return (
    <label className={`flex cursor-pointer items-center justify-center rounded-2xl border px-3 py-3 text-center text-sm font-semibold transition ${on ? "border-[#111] bg-[#111] text-[#D9BC6A]" : "border-[#E2DCCD] bg-white text-[#111]"}`}>
      <input type="radio" name={name} value={value} checked={on} onChange={() => onPick(value)} className="sr-only" />
      {children}
    </label>
  );
}

/** Formulário de cadastro das páginas de captação (motorista parceiro e empresa). */
export function LeadForm({ kind }: { kind: Kind }) {
  const [v, setV] = useState<Record<string, string>>({ has_vehicle: "sim", cnh_ear: "", experience: "", has_cnpj: "" });
  const [cases, setCases] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [utm, setUtm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [completeUrl, setCompleteUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const u: Record<string, string> = {};
      for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid", "gclid"]) {
        const x = p.get(k);
        if (x) u[k] = x.slice(0, 120);
      }
      if (document.referrer) u.referrer = document.referrer.slice(0, 120);
      setUtm(u);
    } catch {
      /* sem parâmetros */
    }
  }, []);

  const set = (k: string) => (x: string) => setV((cur) => ({ ...cur, [k]: x }));
  const on = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => set(k)(k === "phone" ? maskPhone(e.target.value) : e.target.value);

  function check(): string | null {
    if ((v.name ?? "").trim().split(/\s+/).length < 2) return "Escreva seu nome e sobrenome.";
    if ((v.phone ?? "").replace(/\D/g, "").length < 10) return "Informe o celular com DDD.";
    if (kind === "empresa") {
      if (!(v.company_name ?? "").trim()) return "Informe o nome da empresa.";
      if (!/^\S+@\S+\.\S+$/.test(v.email ?? "")) return "Informe um e-mail válido.";
    } else {
      if (!v.cnh_ear) return "Diga se sua CNH tem a observação EAR.";
      if (!v.experience) return "Conte sua experiência como motorista.";
      if (!v.has_cnpj) return "Diga se você tem MEI ou CNPJ.";
      if (v.has_vehicle === "sim" && !(v.vehicle_model ?? "").trim()) return "Informe o modelo do seu carro.";
    }
    if (!consent) return "Marque que concorda com a política de privacidade.";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = check();
    if (problem) {
      setErr(problem);
      return;
    }
    setErr(null);
    setBusy(true);
    const body = { kind, ...v, use_cases: kind === "empresa" ? cases : undefined, utm, consent: true };
    const r = await fetch("/api/public/leads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = r ? ((await r.json().catch(() => ({}))) as { success?: boolean; data?: { completeUrl?: string | null }; error?: { message?: string } }) : {};
    setBusy(false);
    if (!r?.ok || !j.success) {
      setErr(r?.status === 429 ? "Muitos envios seguidos. Fale com a gente pelo WhatsApp." : "Não conseguimos enviar agora. Confira os campos ou fale com a gente pelo WhatsApp.");
      return;
    }
    setCompleteUrl(j.data?.completeUrl ?? null);
    setDone(true);
    // Motorista segue direto para as 8 etapas do cadastro completo, sem esperar link da central.
    if (kind === "motorista" && j.data?.completeUrl) {
      const url = j.data.completeUrl;
      setTimeout(() => window.location.assign(url), 1200);
    }
    try {
      (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq?.("track", "Lead", { content_name: kind });
      (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("event", "generate_lead", { lead_type: kind });
    } catch {
      /* sem pixel */
    }
  }

  if (done)
    return (
      <div className="rounded-[28px] bg-white p-8 text-center shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#111] text-2xl text-[#D9BC6A]">✓</span>
        <h3 className="mt-4 font-prime-serif text-2xl text-[#111]">{kind === "motorista" && completeUrl ? "Etapa 1 concluída!" : "Cadastro recebido!"}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-[#6F6A60]">
          {kind === "motorista"
            ? completeUrl
              ? "Abrindo o cadastro completo (documentos, veículo e dados de pagamento). Seus dados já vão preenchidos. Leva cerca de 10 minutos."
              : "Nossa equipe vai analisar seus dados e chamar você no WhatsApp para os próximos passos."
            : "Um consultor da Prime Vitória vai falar com você em até 1 dia útil para entender a necessidade da sua empresa."}
        </p>
        {kind === "motorista" && completeUrl ? (
          <a href={completeUrl} className="mt-6 inline-block w-full rounded-full bg-[#111] px-6 py-4 text-base font-semibold text-[#D9BC6A]">
            Continuar agora →
          </a>
        ) : null}
      </div>
    );

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-4 rounded-[28px] bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,0.08)] sm:p-8">
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden onChange={on("website")} />

      <div>
        <label className={labelCls} htmlFor="lf-name">Nome completo</label>
        <input id="lf-name" className={field} autoComplete="name" value={v.name ?? ""} onChange={on("name")} placeholder="Seu nome e sobrenome" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="lf-phone">Celular (WhatsApp)</label>
          <input id="lf-phone" className={field} inputMode="tel" autoComplete="tel" value={v.phone ?? ""} onChange={on("phone")} placeholder="(27) 99999-9999" />
        </div>
        <div>
          <label className={labelCls} htmlFor="lf-email">E-mail{kind === "motorista" ? " (opcional)" : " corporativo"}</label>
          <input id="lf-email" className={field} type="email" autoComplete="email" value={v.email ?? ""} onChange={on("email")} placeholder="voce@empresa.com.br" />
        </div>
      </div>

      {kind === "empresa" ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="lf-company">Empresa</label>
              <input id="lf-company" className={field} autoComplete="organization" value={v.company_name ?? ""} onChange={on("company_name")} placeholder="Nome da empresa" />
            </div>
            <div>
              <label className={labelCls} htmlFor="lf-role">Seu cargo</label>
              <input id="lf-role" className={field} autoComplete="organization-title" value={v.role ?? ""} onChange={on("role")} placeholder="Ex.: Compras, RH, Secretária executiva" />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="lf-segment">Segmento</label>
              <select id="lf-segment" className={field} value={v.segment ?? ""} onChange={on("segment")}>
                <option value="">Selecione</option>
                {SEGMENTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="lf-size">Número de colaboradores</label>
              <select id="lf-size" className={field} value={v.company_size ?? ""} onChange={on("company_size")}>
                <option value="">Selecione</option>
                {SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>
          <fieldset>
            <legend className={labelCls}>Do que sua empresa precisa? (pode marcar mais de um)</legend>
            <div className="flex flex-wrap gap-2">
              {USE_CASES.map((c) => {
                const sel = cases.includes(c);
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => setCases((cur) => (sel ? cur.filter((x) => x !== c) : [...cur, c]))}
                    className={`rounded-full border px-3.5 py-2 text-sm font-semibold transition ${sel ? "border-[#111] bg-[#111] text-[#D9BC6A]" : "border-[#E2DCCD] bg-white text-[#111]"}`}
                  >
                    {sel ? "✓ " : ""}
                    {c}
                  </button>
                );
              })}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="lf-volume">Corridas por mês (estimativa)</label>
              <select id="lf-volume" className={field} value={v.monthly_volume ?? ""} onChange={on("monthly_volume")}>
                <option value="">Selecione</option>
                {VOLUMES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls} htmlFor="lf-city">Cidade</label>
              <input id="lf-city" className={field} autoComplete="address-level2" value={v.city ?? ""} onChange={on("city")} placeholder="Ex.: Vitória/ES" />
            </div>
          </div>
        </>
      ) : (
        <>
          <div>
            <label className={labelCls} htmlFor="lf-city">Cidade onde você mora</label>
            <input id="lf-city" className={field} autoComplete="address-level2" value={v.city ?? ""} onChange={on("city")} placeholder="Ex.: Vila Velha/ES" />
          </div>
          <fieldset>
            <legend className={labelCls}>Você tem carro próprio para trabalhar?</legend>
            <div className="grid grid-cols-2 gap-2">
              <Choice name="has_vehicle" value="sim" current={v.has_vehicle ?? ""} onPick={set("has_vehicle")}>Sim</Choice>
              <Choice name="has_vehicle" value="nao" current={v.has_vehicle ?? ""} onPick={set("has_vehicle")}>Não</Choice>
            </div>
          </fieldset>
          {v.has_vehicle === "sim" ? (
            <div className="grid grid-cols-[1fr_90px_110px] gap-2">
              <div>
                <label className={labelCls} htmlFor="lf-model">Modelo</label>
                <input id="lf-model" className={field} value={v.vehicle_model ?? ""} onChange={on("vehicle_model")} placeholder="Ex.: Corolla" />
              </div>
              <div>
                <label className={labelCls} htmlFor="lf-year">Ano</label>
                <input id="lf-year" className={field} inputMode="numeric" maxLength={4} value={v.vehicle_year ?? ""} onChange={on("vehicle_year")} placeholder="2022" />
              </div>
              <div>
                <label className={labelCls} htmlFor="lf-color">Cor</label>
                <input id="lf-color" className={field} value={v.vehicle_color ?? ""} onChange={on("vehicle_color")} placeholder="Preto" />
              </div>
            </div>
          ) : null}
          <fieldset>
            <legend className={labelCls}>Sua CNH tem a observação EAR (exerce atividade remunerada)?</legend>
            <div className="grid grid-cols-3 gap-2">
              <Choice name="cnh_ear" value="sim" current={v.cnh_ear ?? ""} onPick={set("cnh_ear")}>Sim</Choice>
              <Choice name="cnh_ear" value="em_andamento" current={v.cnh_ear ?? ""} onPick={set("cnh_ear")}>Em andamento</Choice>
              <Choice name="cnh_ear" value="nao" current={v.cnh_ear ?? ""} onPick={set("cnh_ear")}>Não</Choice>
            </div>
          </fieldset>
          <fieldset>
            <legend className={labelCls}>Sua experiência como motorista</legend>
            <div className="grid grid-cols-2 gap-2">
              <Choice name="experience" value="executivo" current={v.experience ?? ""} onPick={set("experience")}>Transporte executivo</Choice>
              <Choice name="experience" value="aplicativo" current={v.experience ?? ""} onPick={set("experience")}>Aplicativos</Choice>
              <Choice name="experience" value="ambos" current={v.experience ?? ""} onPick={set("experience")}>Os dois</Choice>
              <Choice name="experience" value="nenhuma" current={v.experience ?? ""} onPick={set("experience")}>Ainda não tenho</Choice>
            </div>
          </fieldset>
          <fieldset>
            <legend className={labelCls}>Você tem MEI ou CNPJ?</legend>
            <div className="grid grid-cols-3 gap-2">
              <Choice name="has_cnpj" value="mei" current={v.has_cnpj ?? ""} onPick={set("has_cnpj")}>MEI</Choice>
              <Choice name="has_cnpj" value="cnpj" current={v.has_cnpj ?? ""} onPick={set("has_cnpj")}>CNPJ</Choice>
              <Choice name="has_cnpj" value="nao" current={v.has_cnpj ?? ""} onPick={set("has_cnpj")}>Não</Choice>
            </div>
          </fieldset>
          <div>
            <label className={labelCls} htmlFor="lf-avail">Dias e horários que você pode trabalhar</label>
            <input id="lf-avail" className={field} value={v.availability ?? ""} onChange={on("availability")} placeholder="Ex.: todos os dias, inclusive madrugada" />
          </div>
        </>
      )}

      <div>
        <label className={labelCls} htmlFor="lf-notes">{kind === "empresa" ? "Conte rapidamente a necessidade (opcional)" : "Quer contar mais alguma coisa? (opcional)"}</label>
        <textarea id="lf-notes" className={`${field} min-h-[96px]`} value={v.notes ?? ""} onChange={on("notes")} maxLength={800} />
      </div>

      <label className="flex items-start gap-3 text-sm text-[#6F6A60]">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-[#111]" />
        <span>
          Li e concordo com a{" "}
          <a href="/privacidade" target="_blank" className="font-semibold text-[#111] underline">
            Política de Privacidade
          </a>{" "}
          e autorizo a Prime Vitória a entrar em contato pelo WhatsApp, telefone e e-mail.
        </span>
      </label>

      {err ? <p className="rounded-2xl bg-[#FCEDEA] px-4 py-3 text-sm font-semibold text-[#A3321F]">{err}</p> : null}

      <button type="submit" disabled={busy} className="w-full rounded-full bg-[#111] px-7 py-4 text-base font-semibold text-[#D9BC6A] shadow-lg transition hover:opacity-90 disabled:opacity-60">
        {busy ? "Enviando…" : kind === "motorista" ? "Quero ser motorista parceiro" : "Quero uma proposta para minha empresa"}
      </button>
    </form>
  );
}
