"use client";

import { useEffect, useRef } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Chama `onRefresh` quando ha alteracoes Postgres nas tabelas com `tenant_id` (debounced).
 */
export function useTenantTableRefresh(
  tenantId: string | null | undefined,
  tables: readonly string[],
  onRefresh: () => void,
  debounceMs = 500
): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  useEffect(() => {
    if (!tenantId || tables.length === 0) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (!active) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => onRefreshRef.current(), debounceMs);
    };

    try {
      const supabase = createSupabaseBrowserClient();
      const filter = `tenant_id=eq.${tenantId}`;
      const channel = supabase.channel(`tenant-refresh-${tenantId}-${tables.join("-")}`);

      for (const table of tables) {
        channel.on("postgres_changes", { event: "*", schema: "public", table, filter }, schedule);
      }

      channel.subscribe();

      return () => {
        active = false;
        if (timer) clearTimeout(timer);
        void supabase.removeChannel(channel);
      };
    } catch {
      return () => {
        active = false;
        if (timer) clearTimeout(timer);
      };
    }
  }, [tenantId, tables, debounceMs]);
}
