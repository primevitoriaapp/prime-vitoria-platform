"use client";

import { useEffect } from "react";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

/** Invisível: enquanto o painel está aberto, pede ao servidor para conferir os voos das próximas horas a cada 5 min. */
export function FlightSweeper() {
  useEffect(() => {
    const run = () => {
      if (document.visibilityState === "hidden") return;
      void fetchWithSupabaseSession("/api/flights/sweep", { method: "POST" }, "admin").catch(() => undefined);
    };
    const first = window.setTimeout(run, 8_000);
    const id = window.setInterval(run, 5 * 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, []);
  return null;
}
