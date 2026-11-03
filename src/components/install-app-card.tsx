"use client";

import { useEffect, useState } from "react";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
type Kind = "ios" | "ios-other" | "android" | "samsung" | "inapp" | null;

/** Qual instrução mostrar para este celular. */
function detect(): Kind {
  const ua = navigator.userAgent;
  const ios = /iphone|ipad|ipod/i.test(ua);
  const android = /android/i.test(ua);
  // Navegador de dentro do WhatsApp, Instagram, Facebook etc.: não instala app.
  if (/FBAN|FBAV|Instagram|WhatsApp|Line\/|; wv\)|GSA\//i.test(ua)) return "inapp";
  if (ios) return /CriOS|FxiOS|EdgiOS/i.test(ua) ? "ios-other" : "ios";
  if (android) return /SamsungBrowser/i.test(ua) ? "samsung" : "android";
  return null;
}

/** Ajuda a instalar o app na tela do celular, em qualquer Android ou iPhone. */
export function InstallAppCard({ appName = "o app", dismissible = true }: { appName?: string; dismissible?: boolean }) {
  const [standalone, setStandalone] = useState(true);
  const [kind, setKind] = useState<Kind>(null);
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [hidden, setHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sa = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(Boolean(sa));
    setKind(detect());
    try {
      if (dismissible) setHidden(localStorage.getItem("pv-install-hide") === "1");
    } catch {
      /* sem armazenamento */
    }
    const h = (e: Event) => {
      e.preventDefault();
      setEvt(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", h);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, [dismissible]);

  if (standalone || hidden || !kind) return null;

  const Step = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#111] text-xs font-bold text-prime-gold">{n}</span>
      <span className="pt-0.5">{children}</span>
    </li>
  );

  return (
    <div className="rounded-3xl border border-prime-gold/50 bg-[#FBF6EA] p-4 text-sm text-[#111]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[15px] font-semibold">📲 Instale {appName} na tela do celular</p>
        {dismissible ? (
          <button
            type="button"
            className="text-xs text-[#6B6F76]"
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
        ) : null}
      </div>
      <p className="mt-1 text-[#4A4D55]">Abre em tela cheia, como um aplicativo, sem precisar procurar o link.</p>

      {kind === "inapp" ? (
        <>
          <p className="mt-3 rounded-xl bg-white px-3 py-2 font-medium text-[#8A5A00]">
            Você abriu pelo WhatsApp (ou outro app). Daqui não dá para instalar: abra no navegador do celular.
          </p>
          <ol className="mt-3 space-y-2">
            <Step n={1}>
              Toque nos <b>três pontinhos ⋮</b> (ou no ícone de compartilhar) no canto da tela.
            </Step>
            <Step n={2}>
              Escolha <b>“Abrir no navegador”</b> / <b>“Abrir no Chrome”</b> / <b>“Abrir no Safari”</b>.
            </Step>
            <Step n={3}>Lá vai aparecer a opção de instalar.</Step>
          </ol>
          <button
            type="button"
            className="mt-3 w-full rounded-2xl bg-[#111] px-4 py-3 font-semibold text-prime-gold"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopied(true);
              } catch {
                /* ignore */
              }
            }}
          >
            {copied ? "Link copiado: cole no navegador" : "Copiar o link"}
          </button>
        </>
      ) : evt ? (
        <button
          type="button"
          className="mt-3 w-full rounded-2xl bg-[#111] px-4 py-3 text-[15px] font-semibold text-prime-gold"
          onClick={async () => {
            await evt.prompt();
            setEvt(null);
          }}
        >
          Instalar app
        </button>
      ) : kind === "ios" ? (
        <ol className="mt-3 space-y-2">
          <Step n={1}>
            Toque em <b>Compartilhar</b> (quadrado com a seta para cima ⬆️), embaixo da tela.
          </Step>
          <Step n={2}>
            Role e toque em <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.
          </Step>
          <Step n={3}>Abra pelo ícone novo da Prime.</Step>
        </ol>
      ) : kind === "ios-other" ? (
        <ol className="mt-3 space-y-2">
          <Step n={1}>
            Toque em <b>Compartilhar</b> ⬆️ (na barra de endereço ou no menu).
          </Step>
          <Step n={2}>
            Toque em <b>Adicionar à Tela de Início</b>. Se não aparecer, abra este link no <b>Safari</b>.
          </Step>
        </ol>
      ) : kind === "samsung" ? (
        <ol className="mt-3 space-y-2">
          <Step n={1}>
            Toque no menu <b>≡</b> (três risquinhos) embaixo, à direita.
          </Step>
          <Step n={2}>
            Toque em <b>Adicionar página a</b> → <b>Tela inicial</b>.
          </Step>
          <Step n={3}>Abra pelo ícone novo da Prime.</Step>
        </ol>
      ) : (
        <ol className="mt-3 space-y-2">
          <Step n={1}>
            No Chrome, toque nos <b>três pontinhos ⋮</b> no canto de cima, à direita.
          </Step>
          <Step n={2}>
            Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.
          </Step>
          <Step n={3}>Confirme e abra pelo ícone novo da Prime.</Step>
        </ol>
      )}
    </div>
  );
}
