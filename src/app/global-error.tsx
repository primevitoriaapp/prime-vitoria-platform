"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/** Erros típicos de página aberta antes de uma atualização do sistema (versão antiga em memória). */
function isStaleVersion(error: Error) {
  const m = `${error?.name ?? ""} ${error?.message ?? ""}`;
  return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Server Action|Failed to find Server Action|unexpected response was received from the server/i.test(m);
}

export default function GlobalError({ error }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
    // Versão antiga aberta no celular: recarrega sozinho uma vez para pegar a versão nova.
    if (isStaleVersion(error)) {
      try {
        const k = "pv-stale-reload";
        const last = Number(sessionStorage.getItem(k) ?? 0);
        if (Date.now() - last > 30_000) {
          sessionStorage.setItem(k, String(Date.now()));
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 24, background: "#F4F2EE", color: "#111", fontFamily: "system-ui, sans-serif", textAlign: "center" }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>Algo deu errado</h1>
        <p style={{ maxWidth: 420, fontSize: 14, color: "#6F6A60", margin: 0 }}>Toque em “Recarregar”. Se continuar, mande um print desta tela para a central.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ borderRadius: 999, background: "#111", color: "#D9BC6A", border: 0, padding: "12px 24px", fontSize: 15, fontWeight: 600 }}
        >
          Recarregar
        </button>
        <p style={{ fontSize: 11, color: "#A8A397", maxWidth: 420, wordBreak: "break-word", margin: 0 }}>
          {error?.digest ? `Código ${error.digest}` : ""} {error?.message ? `· ${String(error.message).slice(0, 160)}` : ""}
        </p>
      </body>
    </html>
  );
}
