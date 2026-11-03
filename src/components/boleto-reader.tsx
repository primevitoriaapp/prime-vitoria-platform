"use client";

import { useState } from "react";
import { pdfToWords } from "@/lib/vouchers/pdf-words-client";
import { boletoTextFields, findBoletoLine, parseBoletoLine, suggestCategory } from "@/lib/finance/boleto";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import type { PdfWord } from "@/lib/vouchers/voucher-types";

export type BoletoFill = {
  description: string;
  supplier: string;
  amount: string;
  due_date: string;
  category: string;
  issuer?: string;
  notes: string;
};

function wordsToText(words: PdfWord[]): string {
  const sorted = [...words].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const lines: PdfWord[][] = [];
  for (const w of sorted) {
    const last = lines[lines.length - 1];
    if (last && last[0].page === w.page && Math.abs(last[0].y - w.y) <= 2) last.push(w);
    else lines.push([w]);
  }
  return lines.map((l) => l.sort((a, b) => a.x - b.x).map((w) => w.text).join(" ")).join("\n");
}

/** Envie o PDF do boleto (ou cole a linha digitável): preenche valor, vencimento, fornecedor e categoria. */
export function BoletoReader({ onFill }: { onFill: (f: BoletoFill) => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [typed, setTyped] = useState("");

  async function apply(text: string) {
    const line = findBoletoLine(text) ?? (text.replace(/\D/g, "").length >= 47 ? text.replace(/\D/g, "") : null);
    const info = line ? parseBoletoLine(line) : null;
    const t = boletoTextFields(text);
    if (!info && !t.amount) {
      setMsg({ ok: false, text: "Não achei a linha digitável nem o valor. Confira se é um boleto em PDF (não foto) ou cole a linha." });
      return;
    }
    const supplier = t.beneficiary ?? (info?.bank ? `Boleto ${info.bank}` : "");
    type Hist = { category?: string; issuer?: string | null };
    let hist: Hist | null = null;
    if (supplier) {
      const r = await fetchWithSupabaseSession(`/api/finance/company-payables/suggest?supplier=${encodeURIComponent(supplier)}`, {}, "admin").catch(() => null);
      const j = (await r?.json().catch(() => null)) as { data?: Hist | null } | null;
      hist = j?.data ?? null;
    }
    const amount = info?.amount ?? t.amount;
    const due = info?.dueDate ?? t.dueDate;
    onFill({
      description: supplier ? `Boleto ${supplier}` : "Boleto",
      supplier,
      amount: amount != null ? String(amount).replace(".", ",") : "",
      due_date: due ?? "",
      category: suggestCategory(t.beneficiary, info?.segment ?? null, hist?.category ?? null),
      issuer: hist?.issuer ?? undefined,
      notes: info ? `Linha digitável: ${info.line}` : ""
    });
    setMsg({
      ok: true,
      text: `Boleto lido${info?.bank ? ` (${info.bank})` : ""}. Confira os campos abaixo${hist ? " — categoria repetida da última conta desse fornecedor" : ""} e salve.`
    });
  }

  async function onFile(file?: File) {
    if (!file) return;
    setBusy(true);
    setMsg(null);
    try {
      const words = await pdfToWords(file);
      if (!words.length) setMsg({ ok: false, text: "Este PDF é uma imagem (escaneado). Cole a linha digitável no campo ao lado." });
      else await apply(wordsToText(words));
    } catch {
      setMsg({ ok: false, text: "Não consegui abrir o PDF." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border-2 border-dashed border-prime-gold/60 bg-[#FBF7EC] p-4 sm:col-span-2 lg:col-span-4">
      <p className="font-semibold">📄 Ler boleto</p>
      <p className="text-sm text-prime-muted">Envie o PDF ou cole a linha digitável: o sistema preenche valor, vencimento, fornecedor e categoria.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="btn-primary cursor-pointer">
          <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
          {busy ? "Lendo…" : "Enviar PDF do boleto"}
        </label>
        <input
          className={`${PRIME_INPUT_CLASS} min-w-[16rem] flex-1`}
          placeholder="ou cole aqui a linha digitável"
          value={typed}
          onChange={(e) => {
            setTyped(e.target.value);
            const n = e.target.value.replace(/\D/g, "").length;
            if (n === 47 || n === 48) void apply(e.target.value);
          }}
        />
      </div>
      {msg ? <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-800" : "text-red-700"}`}>{msg.text}</p> : null}
    </div>
  );
}
