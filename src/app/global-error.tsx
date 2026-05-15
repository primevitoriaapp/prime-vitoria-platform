"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="pt-BR">
      <body className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-slate-900">
        <h1 className="text-xl font-semibold">Algo correu mal</h1>
        <p className="max-w-md text-center text-sm text-slate-600">O erro foi registado. Tente novamente ou contacte o suporte.</p>
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500"
        >
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
