"use client";

import { useEffect, useState } from "react";

type Info = { android: number | null; model: string; inApp: boolean; ios: boolean };

/** Confere o celular antes do download e explica o que fazer quando o app não serve para ele. */
export function ApkCompatCheck({ web = "https://motorista.primevitoria.com/driver", label = "o Prime Motorista" }: { web?: string; label?: string }) {
  const [i, setI] = useState<Info | null>(null);
  useEffect(() => {
    const ua = navigator.userAgent;
    const m = ua.match(/Android\s+(\d+)(?:\.(\d+))?/i);
    const model = ua.match(/Android[^;]*;\s*([^;)]+?)(?:\s+Build\/|\))/i)?.[1]?.trim() ?? "";
    setI({
      android: m ? Number(m[1]) : null,
      model: model && model !== "K" ? model : "",
      inApp: /FBAN|FBAV|Instagram|Line\/|; wv\)/i.test(ua),
      ios: /iPhone|iPad|iPod/i.test(ua)
    });
  }, []);
  if (!i) return null;
  return (
    <div className="mt-6 grid gap-3 text-left text-sm">
      {i.android !== null && i.android < 7 ? (
        <div className="rounded-2xl bg-[#3A1F1B] p-4 text-[#FFD9D2]">
          <b>Seu celular tem Android {i.android}.</b> O app precisa do Android 7 ou mais novo, por isso aparece “não compatível”. Use {label} pelo navegador Chrome:{" "}
          <a href={web} className="font-semibold text-[#C9A84C] underline">
            {web.replace(/^https:\/\//, "").replace(/\/.*$/, "")}
          </a>
          . Funciona igual pelo navegador.
        </div>
      ) : null}
      {i.inApp ? (
        <div className="rounded-2xl bg-[#3A3220] p-4 text-[#F3E3B5]">
          Você abriu este link dentro de outro aplicativo. Se o download não funcionar, toque nos <b>3 pontinhos</b> e escolha <b>“Abrir no Chrome”</b>.
        </div>
      ) : null}
      {i.ios ? (
        <div className="rounded-2xl bg-[#222] p-4 text-[#DDD]">
          No iPhone o app ainda não está disponível. Use pelo Safari:{" "}
          <a href={web} className="font-semibold text-[#C9A84C] underline">
            {web.replace(/^https:\/\//, "").replace(/\/.*$/, "")}
          </a>
          .
        </div>
      ) : null}
      <p className="text-center text-xs text-[#777]">
        Seu celular: {i.ios ? "iPhone" : i.android !== null ? `Android ${i.android}` : "não identificado"}
        {i.model ? ` · ${i.model}` : ""}. Se der erro, mande um print desta tela para a central.
      </p>
    </div>
  );
}
