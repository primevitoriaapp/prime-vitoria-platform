"use client";

import { useState } from "react";

/** No link do orçamento: o cliente aprova com um clique ou pede ajuste. */
type Contratante = { nome: string; cpf: string; email: string; telefone: string; cep: string; endereco: string; numero: string; complemento: string; bairro: string; cidade: string; uf: string };

const cpfMask = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
const cepMask = (v: string) => v.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2");

export function QuoteClientResponse({
  quoteId,
  token,
  status,
  defaultName,
  needsData = false,
  defaultEmail = "",
  defaultPhone = ""
}: {
  quoteId: string;
  token: string;
  status: string;
  defaultName: string;
  /** Pessoa física sem cadastro: pede os dados do contrato ao aprovar. */
  needsData?: boolean;
  defaultEmail?: string;
  defaultPhone?: string;
}) {
  const [ct, setCt] = useState<Contratante>({ nome: defaultName, cpf: "", email: defaultEmail, telefone: defaultPhone, cep: "", endereco: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "" });
  const setC = (k: keyof Contratante) => (e: { target: { value: string } }) => {
    const v = k === "cpf" ? cpfMask(e.target.value) : k === "cep" ? cepMask(e.target.value) : k === "uf" ? e.target.value.toUpperCase().slice(0, 2) : e.target.value;
    setCt((x) => ({ ...x, [k]: v }));
    if (k === "cep" && v.replace(/\D/g, "").length === 8) void lookupCep(v.replace(/\D/g, ""));
  };
  async function lookupCep(d: string) {
    try {
      const r = await fetch(`https://viacep.com.br/ws/${d}/json/`);
      const j = (await r.json()) as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (j.erro) return;
      setCt((x) => ({ ...x, endereco: j.logradouro || x.endereco, bairro: j.bairro || x.bairro, cidade: j.localidade || x.cidade, uf: j.uf || x.uf }));
    } catch {
      /* sem busca de CEP: a pessoa digita */
    }
  }
  const ctOk =
    ct.nome.trim().split(/\s+/).length >= 2 &&
    ct.cpf.replace(/\D/g, "").length === 11 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ct.email.trim()) &&
    ct.telefone.replace(/\D/g, "").length >= 10 &&
    ct.cep.replace(/\D/g, "").length === 8 &&
    ct.endereco.trim().length >= 3 &&
    ct.numero.trim().length >= 1 &&
    ct.bairro.trim().length >= 2 &&
    ct.cidade.trim().length >= 2 &&
    ct.uf.trim().length === 2;
  const [mode, setMode] = useState<"idle" | "aprovar" | "ajuste">("idle");
  const [name, setName] = useState(defaultName);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(status === "aprovado" ? "Este orçamento já está aprovado. Obrigado!" : null);
  const [err, setErr] = useState<string | null>(null);
  const [pay, setPay] = useState<{ url: string; amount: number } | null>(null);

  async function send(action: "aprovar" | "ajuste") {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/public/quotes/${quoteId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        t: token,
        action,
        name: action === "aprovar" && needsData ? ct.nome : name,
        message: message || undefined,
        contratante: action === "aprovar" && needsData ? ct : undefined
      })
    });
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; data?: { status: string; payment?: { url: string; amount: number } | null }; error?: { message?: string } };
    setBusy(false);
    if (!res.ok || !j.success) return setErr(j.error?.message ?? "Não foi possível enviar. Tente de novo.");
    if (j.data?.payment?.url) setPay(j.data.payment);
    setDone(
      action === "ajuste"
        ? "Recebemos seu pedido de ajuste. A Prime Vitória responde em breve."
        : needsData
          ? "Orçamento aprovado e dados recebidos! A Prime Vitória vai te enviar o contrato para assinatura digital por e-mail e WhatsApp. Confira também a caixa de spam."
          : "Orçamento aprovado! Seus serviços estão reservados e você recebe a confirmação com os dados do motorista antes de cada serviço."
    );
  }

  if (done) {
    return (
      <div style={{ margin: "0 26px 18px", display: "grid", gap: 10 }}>
        <div style={{ padding: 16, borderRadius: 12, background: "#ECFDF5", color: "#065F46", fontSize: 14, fontWeight: 600 }}>{done}</div>
        {pay ? (
          <div style={{ padding: 16, borderRadius: 14, background: "#111", color: "#fff" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Garanta sua reserva: sinal de 50%</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>
              {pay.amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} no PIX ou cartão (até 12x; no cartão, a taxa da maquininha é do pagador). O restante segue o combinado no contrato.
            </div>
            <a
              href={pay.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "block", marginTop: 12, padding: "14px 16px", borderRadius: 12, background: "#C9A84C", color: "#111", fontWeight: 700, fontSize: 15, textAlign: "center", textDecoration: "none" }}
            >
              Pagar o sinal agora
            </a>
          </div>
        ) : null}
      </div>
    );
  }

  const btn = (bg: string, color: string): React.CSSProperties => ({ flex: 1, minWidth: 160, padding: "14px 16px", borderRadius: 12, border: 0, background: bg, color, fontWeight: 700, fontSize: 15, cursor: "pointer" });
  const input: React.CSSProperties = { width: "100%", padding: "12px", borderRadius: 10, border: "1px solid #DDD5C2", fontSize: 16, boxSizing: "border-box" };

  return (
    <div className="quote-actions" style={{ margin: "0 26px 18px", padding: 16, borderRadius: 14, background: "#FAF7F0", border: "1px solid #EEE9DC" }}>
      {mode === "idle" ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" style={btn("#111", "#C9A84C")} onClick={() => setMode("aprovar")}>
            ✓ Aprovar orçamento
          </button>
          <button type="button" style={btn("#fff", "#111")} onClick={() => setMode("ajuste")}>
            Pedir ajuste
          </button>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {mode === "aprovar" && needsData ? (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111" }}>Seus dados para o contrato</div>
              <div style={{ fontSize: 12, color: "#6F6A60", marginTop: -6 }}>Usados só no contrato de prestação de serviço e na nota fiscal.</div>
              <label style={{ fontSize: 13 }}>
                Nome completo
                <input style={input} value={ct.nome} onChange={setC("nome")} autoComplete="name" />
              </label>
              <div className="qcr-grid" style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
                <label style={{ fontSize: 13 }}>
                  CPF
                  <input style={input} inputMode="numeric" value={ct.cpf} onChange={setC("cpf")} placeholder="000.000.000-00" />
                </label>
                <label style={{ fontSize: 13 }}>
                  WhatsApp
                  <input style={input} type="tel" inputMode="tel" value={ct.telefone} onChange={setC("telefone")} autoComplete="tel" />
                </label>
              </div>
              <label style={{ fontSize: 13 }}>
                E-mail (para receber o contrato)
                <input style={input} type="email" value={ct.email} onChange={setC("email")} autoComplete="email" />
              </label>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                <label style={{ fontSize: 13 }}>
                  CEP
                  <input style={input} inputMode="numeric" value={ct.cep} onChange={setC("cep")} placeholder="00000-000" autoComplete="postal-code" />
                </label>
                <label style={{ fontSize: 13 }}>
                  Número
                  <input style={input} value={ct.numero} onChange={setC("numero")} />
                </label>
              </div>
              <label style={{ fontSize: 13 }}>
                Endereço (rua / avenida)
                <input style={input} value={ct.endereco} onChange={setC("endereco")} autoComplete="address-line1" />
              </label>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
                <label style={{ fontSize: 13 }}>
                  Complemento
                  <input style={input} value={ct.complemento} onChange={setC("complemento")} placeholder="Apto, bloco…" />
                </label>
                <label style={{ fontSize: 13 }}>
                  Bairro
                  <input style={input} value={ct.bairro} onChange={setC("bairro")} />
                </label>
              </div>
              <div style={{ display: "grid", gap: 10, gridTemplateColumns: "minmax(0,3fr) minmax(0,1fr)" }}>
                <label style={{ fontSize: 13 }}>
                  Cidade
                  <input style={input} value={ct.cidade} onChange={setC("cidade")} />
                </label>
                <label style={{ fontSize: 13 }}>
                  UF
                  <input style={input} value={ct.uf} onChange={setC("uf")} maxLength={2} />
                </label>
              </div>
            </div>
          ) : (
            <label style={{ fontSize: 13 }}>
              Seu nome
              <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          )}
          <label style={{ fontSize: 13 }}>
            {mode === "aprovar" ? "Observação (opcional): nomes dos passageiros, voo…" : "O que precisa mudar?"}
            <textarea style={{ ...input, minHeight: 80 }} value={message} onChange={(e) => setMessage(e.target.value)} />
          </label>
          {err ? <p style={{ color: "#B91C1C", fontSize: 13, margin: 0 }}>{err}</p> : null}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy || (mode === "aprovar" && needsData ? !ctOk : name.trim().length < 2) || (mode === "ajuste" && message.trim().length < 3)}
              style={{ ...btn("#111", "#C9A84C"), opacity: busy ? 0.6 : 1 }}
              onClick={() => void send(mode)}
            >
              {busy ? "Enviando…" : mode === "aprovar" ? "Confirmar aprovação" : "Enviar pedido de ajuste"}
            </button>
            <button type="button" style={btn("transparent", "#555")} onClick={() => setMode("idle")}>
              Voltar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
