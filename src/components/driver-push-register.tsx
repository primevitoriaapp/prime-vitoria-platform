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

/**
 * Regista token FCM do motorista (Firebase auto ou colagem manual em staging).
 */
export function DriverPushRegister() {
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

  return (
    <section className="card" style={{ marginTop: 12 }}>
      <h2>Notificações push</h2>
      <p className="text-sm text-slate-600">
        Necessário para receber ofertas de despacho e corridas atribuídas. Usa FCM real (sem simulação).
      </p>
      {firebaseReady ? (
        <button type="button" onClick={() => void onAutoRegister()} disabled={state === "loading"}>
          {state === "loading" ? "A activar…" : "Activar notificações neste dispositivo"}
        </button>
      ) : (
        <p className="text-sm text-amber-800">
          Firebase Web não configurado (<code>NEXT_PUBLIC_FIREBASE_*</code> + <code>NEXT_PUBLIC_FCM_VAPID_KEY</code>).
          Em staging, cole abaixo o token FCM obtido no dispositivo.
        </p>
      )}
      <form onSubmit={(e) => void onManualSubmit(e)} className="grid" style={{ marginTop: 8 }}>
        <input
          value={manualToken}
          onChange={(e) => setManualToken(e.target.value)}
          placeholder="Token FCM (colar se necessário)"
          className="col-span-2"
        />
        <button type="submit" disabled={state === "loading"}>
          Guardar token manualmente
        </button>
      </form>
      {message ? (
        <p className={`mt-2 text-sm ${state === "error" ? "text-red-700" : "text-green-800"}`}>{message}</p>
      ) : null}
    </section>
  );
}
