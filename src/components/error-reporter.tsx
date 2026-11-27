"use client";

import { useEffect } from "react";

/** Manda para a central os erros que acontecem na tela (uma vez cada, por aba). */
export function reportClientError(message: string, digest?: string) {
  try {
    const key = `pv-err:${message.slice(0, 120)}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* sem storage: manda mesmo assim */
  }
  const body = JSON.stringify({ message: message.slice(0, 1500), path: location.pathname, digest });
  try {
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-errors", new Blob([body], { type: "application/json" }));
    else void fetch("/api/client-errors", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    /* ignora */
  }
}

export function ErrorReporter() {
  useEffect(() => {
    const onError = (e: ErrorEvent) => reportClientError(e.error?.stack?.split("\n").slice(0, 3).join(" | ") || e.message || "Erro na tela");
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; stack?: string } | string | undefined;
      const msg = typeof r === "string" ? r : r?.stack?.split("\n").slice(0, 3).join(" | ") || r?.message || "Promessa rejeitada";
      reportClientError(msg);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
