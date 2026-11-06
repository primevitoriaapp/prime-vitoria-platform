"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { buildZip, type ZipEntry } from "@/lib/zip/store-zip";

type Summary = {
  month: string;
  faturas_emitidas: number;
  faturas_recebidas: number;
  corridas_recebidas_fora_de_fatura: number;
  outras_receitas: number;
  pagamentos_antecipados: number;
  despesas_pagas: number;
  repasses_pagos: number;
  despesas_sem_anexo: number;
  repasses_sem_comprovante: number;
  arquivos: number;
};
type Manifest = { summary: Summary; csvs: { path: string; content: string }[]; files: { path: string; url: string }[] };

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
function lastMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Gera o pacote do mês para o contador: um .zip com planilhas e todos os anexos. */
export function AccountingPackagePanel() {
  const [month, setMonth] = useState(lastMonth());
  const [busy, setBusy] = useState<string | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  async function generate() {
    setErr(null);
    setFailed([]);
    setBusy("Juntando as informações do mês…");
    try {
      const r = await fetchWithSupabaseSession(`/api/finance/accounting-package?month=${month}`, {}, "admin");
      const j = (await r.json().catch(() => ({}))) as { success?: boolean; data?: Manifest; error?: { message?: string } };
      if (!r.ok || !j.success || !j.data) throw new Error(j.error?.message ?? "Não foi possível montar o pacote.");
      setSum(j.data.summary);
      const enc = new TextEncoder();
      const entries: ZipEntry[] = j.data.csvs.map((c) => ({ path: c.path, data: enc.encode(c.content) }));
      const miss: string[] = [];
      let n = 0;
      for (const f of j.data.files) {
        n++;
        setBusy(`Baixando arquivo ${n} de ${j.data.files.length}…`);
        try {
          const res = f.url.startsWith("/") ? await fetchWithSupabaseSession(f.url, {}, "admin") : await fetch(f.url);
          if (!res.ok) throw new Error(String(res.status));
          entries.push({ path: f.path, data: new Uint8Array(await res.arrayBuffer()) });
        } catch {
          miss.push(f.path);
        }
      }
      if (miss.length) entries.push({ path: "ARQUIVOS_QUE_FALTARAM.txt", data: enc.encode(miss.join("\r\n")) });
      setBusy("Montando o arquivo .zip…");
      const zip = buildZip(entries);
      const blob = new Blob([zip.buffer as ArrayBuffer], { type: "application/zip" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `Prime_Contabilidade_${month}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      setFailed(miss);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erro ao gerar.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl border-2 border-prime-gold bg-white p-5 shadow-prime-card">
        <h2 className="text-lg font-semibold">Pacote do contador</h2>
        <p className="text-sm text-prime-muted">Um único arquivo .zip com tudo do mês, organizado em pastas, pronto para mandar à contabilidade.</p>
        <ul className="mt-3 grid gap-1 text-sm">
          <li>
            📁 <b>01 Receitas</b>: faturas (planilha + PDF de cada uma + nota fiscal e boleto anexados), corridas recebidas fora de fatura, outras receitas e pagamentos antecipados
          </li>
          <li>
            📁 <b>02 Despesas</b>: contas a pagar com boleto, comprovante e nota fiscal de cada uma
          </li>
          <li>
            📁 <b>03 Repasses</b>: pagamentos aos motoristas com os comprovantes
          </li>
          <li>
            📁 <b>04 Extratos</b>: lançamentos de cada conta e os arquivos originais (OFX) enviados na conciliação
          </li>
          <li>
            📄 <b>00 RESUMO</b>: totais do mês e o que ficou sem anexo
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="font-medium">Mês</span>
            <input type="month" className={PRIME_INPUT_CLASS} value={month} onChange={(e) => setMonth(e.target.value)} />
          </label>
          <button type="button" disabled={Boolean(busy) || !month} onClick={() => void generate()} className="rounded-lg bg-[#111] px-5 py-2.5 text-sm font-semibold text-[#C9A84C] disabled:opacity-50">
            {busy ?? "⬇ Gerar pacote do mês (.zip)"}
          </button>
        </div>
        {err ? <p className="mt-2 text-sm text-red-700">{err}</p> : null}
      </section>

      {sum ? (
        <section className="rounded-2xl border border-prime-border bg-white p-5 shadow-prime-card">
          <h3 className="font-semibold">Resumo de {sum.month.split("-").reverse().join("/")}</h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-3">
            {(
              [
                ["Faturas emitidas", sum.faturas_emitidas],
                ["Faturas recebidas", sum.faturas_recebidas],
                ["Corridas recebidas fora de fatura", sum.corridas_recebidas_fora_de_fatura],
                ["Outras receitas", sum.outras_receitas],
                ["Pagamentos antecipados", sum.pagamentos_antecipados],
                ["Despesas pagas", sum.despesas_pagas],
                ["Repasses pagos", sum.repasses_pagos]
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-prime-bg p-3">
                <dt className="text-xs text-prime-muted">{k}</dt>
                <dd className="text-lg font-semibold">{brl(v)}</dd>
              </div>
            ))}
          </dl>
          {sum.despesas_sem_anexo || sum.repasses_sem_comprovante || failed.length ? (
            <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">Antes de mandar ao contador, confira:</p>
              {sum.despesas_sem_anexo ? <p>• {sum.despesas_sem_anexo} conta(s) a pagar sem boleto/comprovante/nota (Financeiro → Contas a pagar → “+ anexar”).</p> : null}
              {sum.repasses_sem_comprovante ? <p>• {sum.repasses_sem_comprovante} repasse(s) sem comprovante (Repasses → aba Pagos).</p> : null}
              {failed.length ? <p>• {failed.length} arquivo(s) não baixaram; a lista está no ARQUIVOS_QUE_FALTARAM.txt dentro do zip.</p> : null}
            </div>
          ) : (
            <p className="mt-3 text-sm text-emerald-700">✓ Tudo com anexo. Pacote completo.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
