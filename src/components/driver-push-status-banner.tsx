"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";
import { readFirebaseWebConfig } from "@/lib/firebase/messaging-config";

type Readiness = {
  serverConfigured: boolean;
  firebaseWebConfigured: boolean;
  operationalReady: boolean;
  tokenRegistered: boolean;
};

type Props = {
  /** Preview admin: consulta push do motorista seleccionado. */
  driverId?: string | null;
  devFallbackRole?: "motorista" | "admin" | "operador";
};

/**
 * Banner compacto: push activo, fallback realtime, ou passos para activar FCM.
 */
export function DriverPushStatusBanner({ driverId, devFallbackRole = "motorista" }: Props) {
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = driverId ? `?driver_id=${encodeURIComponent(driverId)}` : "";
    const res = await fetchWithSupabaseSession(`/api/drivers/push-readiness${qs}`, {}, devFallbackRole);
    const json = (await res.json()) as { success?: boolean; data?: Readiness };
    if (res.ok && json.success && json.data) {
      setReadiness(json.data);
    } else {
      const web = Boolean(readFirebaseWebConfig());
      setReadiness({
        serverConfigured: false,
        firebaseWebConfigured: web,
        operationalReady: false,
        tokenRegistered: false
      });
    }
    setLoading(false);
  }, [driverId, devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-500" aria-busy="true">
        A verificar notificações…
      </div>
    );
  }

  if (!readiness) return null;

  if (readiness.operationalReady && readiness.tokenRegistered) {
    return (
      <div
        className="rounded-xl border border-emerald-800/50 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200"
        role="status"
      >
        <span className="font-medium text-emerald-100">Push activo</span>
        <span className="text-emerald-200/80"> — novas corridas despachadas chegam por notificação. A lista actualiza em tempo real.</span>
      </div>
    );
  }

  if (readiness.tokenRegistered && !readiness.serverConfigured) {
    return (
      <div className="rounded-xl border border-amber-800/50 bg-amber-950/40 px-4 py-3 text-sm text-amber-100" role="status">
        <p className="font-medium">Token registado — servidor push pendente</p>
        <p className="mt-1 text-amber-200/80">
          O dispositivo está pronto; falta <code className="text-xs">FCM_SERVER_KEY</code> no ambiente (Vercel). Use{" "}
          <strong>Actualizar</strong> na lista até o envio estar activo.
        </p>
      </div>
    );
  }

  if (!readiness.firebaseWebConfigured) {
    return (
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 px-4 py-3 text-sm text-slate-300" role="status">
        <p className="font-medium text-slate-200">Modo sem push automático</p>
        <p className="mt-1 text-slate-400">
          Firebase Web não configurado. A lista actualiza via tempo real e botão <strong>Actualizar</strong>. Registe token
          manualmente em{" "}
          <Link href="#push-setup" className="text-amber-400 hover:underline">
            Notificações
          </Link>{" "}
          (staging).
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-700/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-100" role="status">
      <p className="font-medium">Active notificações para receber despachos</p>
      <p className="mt-1 text-amber-200/80">
        Sem push, depende de <strong>Actualizar</strong> ou Realtime.{" "}
        <Link href="#push-setup" className="font-medium text-amber-300 hover:underline">
          Configurar agora ↓
        </Link>
      </p>
    </div>
  );
}
