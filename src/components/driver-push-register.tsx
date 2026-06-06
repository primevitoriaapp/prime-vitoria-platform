"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { readFirebaseWebConfig } from "@/lib/firebase/messaging-config";
import { obtainFcmRegistrationToken, resetFcmTokenCache } from "@/lib/firebase/messaging-client";

type PushState = "idle" | "loading" | "registered" | "unavailable" | "error";

async function savePushToken(token: string, platform: "web" | "unknown"): Promise<string | null> {
  const res = await fetchWithSupabaseSession(
    "/api/drivers/push-token",
    {
      method: "POST",
      body: JSON.stringify({ token, platform })
    },
    "motorista"
  );
  const json = (await res.json()) as { success?: boolean; error?: { message?: string } };
  if (!res.ok || !json.success) {
    return json.error?.message ?? "Falha ao guardar token";
  }
  return null;
}

type Props = {
  /** Painel escuro em /driver */
  variant?: "light" | "dark";
};

/**
 * Regista token FCM do motorista (Firebase auto ou colagem manual em staging).
 */
export function DriverPushRegister({ variant = "light" }: Props) {
  const firebaseReady = Boolean(readFirebaseWebConfig());
  const [state, setState] = useState<PushState>(firebaseReady ? "idle" : "unavailable");
  const [message, setMessage] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState("");

  const registerToken = useCallback(async (token: string) => {
    setState("loading");
    setMessage(null);
    const err = await savePushToken(token, "web");
    if (err) {
      setState("error");
      setMessage(err);
      return;
    }
    setState("registered");
    setMessage("Notificações push activas neste dispositivo.");
  }, []);

  const onAutoRegister = useCallback(async () => {
    setState("loading");
    setMessage(null);
    resetFcmTokenCache();
    try {
      const token = await obtainFcmRegistrationToken();
      if (!token) {
        setState("error");
        setMessage("Permissão negada ou Firebase indisponível neste browser.");
        return;
      }
      await registerToken(token);
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [registerToken]);

  useEffect(() => {
    if (!firebaseReady) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = createSupabaseBrowserClient();
        const {
          data: { session }
        } = await supabase.auth.getSession();
        if (!session || cancelled) return;
        await onAutoRegister();
      } catch {
        /* sem sessao ou env Supabase */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [firebaseReady, onAutoRegister]);

  async function onManualSubmit(event: FormEvent) {
    event.preventDefault();
    const token = manualToken.trim();
    if (token.length < 20) {
      setMessage("Token inválido (mínimo 20 caracteres).");
      setState("error");
      return;
    }
    await registerToken(token);
  }

  const dark = variant === "dark";

  if (!firebaseReady) {
    return null;
  }

  return (
    <section className={dark ? "space-y-3" : "card"} style={dark ? undefined : { marginTop: 12 }}>
      {!dark ? <h2>Notificações push</h2> : null}
      <p className={dark ? "text-sm text-slate-400" : "text-sm text-slate-600"}>
        Necessário para receber ofertas de despacho e corridas atribuídas. Usa FCM real (sem simulação).
      </p>
      <button
        type="button"
        onClick={() => void onAutoRegister()}
        disabled={state === "loading"}
        className={
          dark
            ? "min-h-[2.75rem] w-full rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
            : undefined
        }
      >
        {state === "loading" ? "A activar…" : "Activar notificações neste dispositivo"}
      </button>
      <form onSubmit={(e) => void onManualSubmit(e)} className={dark ? "space-y-2" : "grid"} style={dark ? undefined : { marginTop: 8 }}>
        <input
          value={manualToken}
          onChange={(e) => setManualToken(e.target.value)}
          placeholder="Token FCM (colar se necessário)"
          className={
            dark
              ? "w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
              : "col-span-2"
          }
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className={
            dark
              ? "min-h-[2.5rem] rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-800"
              : undefined
          }
        >
          Guardar token manualmente
        </button>
      </form>
      {message ? (
        <p
          className={`text-sm ${state === "error" ? (dark ? "text-red-300" : "text-red-700") : dark ? "text-emerald-300" : "text-green-800"}`}
          role="status"
          aria-live="polite"
        >
          {message}
        </p>
      ) : null}
    </section>
  );
}
