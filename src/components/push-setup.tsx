"use client";

import { useCallback, useEffect, useState } from "react";

type State = "checking" | "unsupported" | "ios-install" | "off" | "denied" | "on" | "working";

function urlBase64ToUint8Array(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

/**
 * Ativa os avisos no aparelho (Android, computador e iPhone com o app na tela de início).
 * audience "motorista" usa o service worker do app do motorista; "central" usa /push-sw.js.
 */
export function PushSetup({ audience, compact = false }: { audience: "motorista" | "central"; compact?: boolean }) {
  const [state, setState] = useState<State>("checking");
  const [msg, setMsg] = useState<string | null>(null);
  const swUrl = audience === "motorista" ? "/driver/service-worker.js" : "/push-sw.js";
  const scope = audience === "motorista" ? "/driver/" : "/";

  const registration = useCallback(async () => {
    const existing = await navigator.serviceWorker.getRegistration(scope);
    if (existing && existing.active?.scriptURL.endsWith(swUrl)) return existing;
    const reg = await navigator.serviceWorker.register(swUrl, { scope });
    await navigator.serviceWorker.ready.catch(() => undefined);
    return reg;
  }, [scope, swUrl]);

  const refresh = useCallback(async () => {
    if (typeof window === "undefined") return;
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) {
      setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      return;
    }
    if (Notification.permission === "denied") {
      setState("denied");
      return;
    }
    const reg = await navigator.serviceWorker.getRegistration(scope);
    const sub = await reg?.pushManager.getSubscription();
    setState(sub && Notification.permission === "granted" ? "on" : "off");
  }, [scope]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function enable() {
    setState("working");
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const keyRes = await fetch("/api/push/public-key", { cache: "no-store" });
      const keyJson = (await keyRes.json()) as { data?: { publicKey: string } };
      if (!keyJson.data?.publicKey) throw new Error("Chave de avisos indisponível");
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(keyJson.data.publicKey) });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON())
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
      if (!res.ok || !j.success) throw new Error(j.error?.message ?? "Não foi possível salvar");
      setState("on");
      await test(sub.endpoint);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Falhou");
      setState("off");
    }
  }

  async function test(endpoint?: string) {
    const reg = await navigator.serviceWorker.getRegistration(scope);
    const ep = endpoint ?? (await reg?.pushManager.getSubscription())?.endpoint;
    if (!ep) return;
    const res = await fetch("/api/push/test", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: ep }) });
    const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: { message?: string } };
    setMsg(res.ok && j.success ? "Aviso de teste enviado. Deve aparecer em segundos." : (j.error?.message ?? "Teste falhou"));
  }

  if (state === "checking") return null;

  const box = compact ? "rounded-xl p-3 text-sm" : "rounded-2xl p-4 text-sm";
  const dark = false;

  if (state === "on") {
    return compact ? (
      <div className={`${box} flex items-center justify-between gap-2 bg-emerald-50 text-emerald-900`}>
        <span>✓ Avisos ativados neste aparelho</span>
        <button type="button" className="text-xs font-semibold underline" onClick={() => void test()}>
          Testar
        </button>
      </div>
    ) : (
      <div className={`${box} ${dark ? "bg-emerald-900/30 text-emerald-200" : "bg-emerald-50 text-emerald-900"} flex items-center justify-between gap-2`}>
        <span>✓ Avisos de corrida ativados neste celular</span>
        <button type="button" className="text-xs font-semibold underline" onClick={() => void test()}>
          Enviar teste
        </button>
        {msg ? <span className="w-full text-xs opacity-80">{msg}</span> : null}
      </div>
    );
  }

  const wrap = `${box} ${dark ? "border border-[#C9A84C]/50 bg-[#C9A84C]/10 text-[#F5F5F5]" : "border border-amber-300 bg-amber-50 text-amber-950"}`;

  if (state === "ios-install") {
    return (
      <div className={wrap}>
        <p className="font-semibold">Para receber aviso de corrida no iPhone:</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>
            Toque em <b>Compartilhar</b> (quadrado com seta) na barra do Safari.
          </li>
          <li>
            Escolha <b>Adicionar à Tela de Início</b> e confirme.
          </li>
          <li>
            Abra o app <b>PV Motorista</b> pelo ícone novo e toque em <b>Ativar avisos</b>.
          </li>
        </ol>
        <p className="mt-2 text-xs opacity-80">O iPhone só libera avisos para app aberto pela tela de início (iOS 16.4 ou mais novo).</p>
      </div>
    );
  }

  if (state === "unsupported") {
    return <div className={wrap}>Este navegador não recebe avisos. No Android use o Chrome; no iPhone, o Safari com o app na tela de início.</div>;
  }

  if (state === "denied") {
    return (
      <div className={wrap}>
        <p className="font-semibold">Os avisos estão bloqueados neste aparelho.</p>
        <p className="mt-1 text-xs opacity-90">
          Libere em Ajustes do celular → Notificações → {audience === "motorista" ? "PV Motorista / Chrome" : "navegador"} → Permitir. Depois volte aqui.
        </p>
      </div>
    );
  }

  return (
    <div className={wrap}>
      {!compact ? (
        <p className="font-semibold">{audience === "motorista" ? "Ative os avisos para não perder corrida" : "Receba aviso de pedido novo neste aparelho"}</p>
      ) : null}
      {!compact ? (
        <p className="mt-1 text-xs opacity-90">
          {audience === "motorista" ? "O celular toca quando a central te passar uma corrida ou mudar alguma coisa nela, mesmo com o app fechado." : "Funciona com o navegador fechado (celular ou computador)."}
        </p>
      ) : null}
      <button
        type="button"
        disabled={state === "working"}
        onClick={() => void enable()}
        className={`mt-2 w-full rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-60 ${dark ? "bg-[#C9A84C] text-[#111]" : "bg-[#111] text-[#fff]"}`}
      >
        {state === "working" ? "Ativando…" : "🔔 Ativar avisos neste aparelho"}
      </button>
      {msg ? <p className="mt-2 text-xs">{msg}</p> : null}
    </div>
  );
}
