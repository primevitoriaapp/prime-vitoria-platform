"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Ajuda a instalar o app na tela do celular (Android: botão; iPhone: passo a passo). */
export function InstallAppCard() {
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const sa = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(Boolean(sa));
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));
    try {
      setHidden(localStorage.getItem("pv-install-hide") === "1");
    } catch {
      /* sem armazenamento */
    }
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  if (standalone || hidden) return null;
  if (!ios && !evt) return null;

  return (
    <div className="rounded-3xl border border-prime-gold/50 bg-[#FBF6EA] p-4 text-sm text-[#111]">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">📲 Coloque o app na tela do celular</p>
        <button
          type="button"
          className="text-xs text-[#8A8A8A]"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem("pv-install-hide", "1");
            } catch {
              /* ignore */
            }
          }}
        >
          Agora não
        </button>
      </div>
      {ios ? (
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-[#333]">
          <li>
            No Safari, toque em <b>Compartilhar</b> (quadrado com a seta para cima).
          </li>
          <li>
            Role e toque em <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.
          </li>
          <li>Abra pelo ícone novo da Prime. Ele abre em tela cheia, como um app.</li>
        </ol>
      ) : (
        <>
          <p className="mt-1 text-[#555]">Abre em tela cheia, como um aplicativo, e recebe os avisos de corrida.</p>
          <button
            type="button"
            className="mt-3 w-full rounded-2xl bg-[#111] px-4 py-3 font-semibold text-prime-gold"
            onClick={async () => {
              await evt?.prompt();
              setEvt(null);
            }}
          >
            Instalar app
          </button>
        </>
      )}
    </div>
  );
}
