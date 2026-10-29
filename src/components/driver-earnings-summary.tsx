"use client";

import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Summary = {
  hoje: number;
  mes: number;
  corridas_mes: number;
  previsto: number;
  a_receber: number;
  liberado: number;
  aguardando_cliente: number;
  pago: number;
};

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Topo de "Meus ganhos" no app do parceiro. */
export function DriverEarningsSummary() {
  const [s, setS] = useState<Summary | null>(null);
  useEffect(() => {
    void (async () => {
      const res = await fetchWithSupabaseSession("/api/drivers/me/earnings", {}, "motorista");
      const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: Summary };
      if (res.ok && json.success && json.data) setS(json.data);
    })();
  }, []);
  if (!s) return null;
  const box = "rounded-xl bg-[#2a2a2e] p-3";
  return (
    <div className="grid grid-cols-2 gap-2 text-[#f5f5f5]">
      <div className={`${box} col-span-2 border border-[#C9A84C]/40`}>
        <p className="text-xs uppercase tracking-wide text-[#AAAAAA]">A receber</p>
        <p className="text-2xl font-bold text-[#C9A84C]">{brl(s.a_receber)}</p>
        <p className="mt-1 text-xs text-[#AAAAAA]">
          {brl(s.liberado)} liberado para pagamento · {brl(s.aguardando_cliente)} aguardando o cliente pagar a Prime
        </p>
      </div>
      <div className={box}>
        <p className="text-xs text-[#AAAAAA]">Hoje</p>
        <p className="text-lg font-semibold">{brl(s.hoje)}</p>
      </div>
      <div className={box}>
        <p className="text-xs text-[#AAAAAA]">Este mês ({s.corridas_mes} corridas)</p>
        <p className="text-lg font-semibold">{brl(s.mes)}</p>
      </div>
      <div className={box}>
        <p className="text-xs text-[#AAAAAA]">Previsto (agendadas)</p>
        <p className="text-lg font-semibold">{brl(s.previsto)}</p>
      </div>
      <div className={box}>
        <p className="text-xs text-[#AAAAAA]">Já pago</p>
        <p className="text-lg font-semibold">{brl(s.pago)}</p>
      </div>
    </div>
  );
}
