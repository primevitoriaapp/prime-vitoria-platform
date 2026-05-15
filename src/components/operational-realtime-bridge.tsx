"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

type Props = {
  /** Só subscreve com sessão autenticada no browser (RLS + filtro tenant). */
  tenantId: string | null;
};

/**
 * Ouve alterações em `trips` e inserções em `driver_locations` (Supabase Realtime)
 * para o tenant ativo e pede `router.refresh()` para RSC (KPIs, agenda, mapa).
 */
export function OperationalRealtimeBridge({ tenantId }: Props) {
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!tenantId) return;

    let active = true;

    const scheduleRefresh = () => {
      if (!active) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        router.refresh();
      }, 450);
    };

    try {
      const supabase = createSupabaseBrowserClient();
      const filter = `tenant_id=eq.${tenantId}`;

      const tripsChannel = supabase
        .channel(`ops-trips-${tenantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "trips", filter }, scheduleRefresh)
        .subscribe();

      const locChannel = supabase
        .channel(`ops-driver-loc-${tenantId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "driver_locations", filter },
          scheduleRefresh
        )
        .subscribe();

      const notesChannel = supabase
        .channel(`ops-trip-notes-${tenantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "trip_operator_notes", filter }, scheduleRefresh)
        .subscribe();

      const claimsChannel = supabase
        .channel(`ops-trip-claims-${tenantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "trip_operational_claims", filter }, scheduleRefresh)
        .subscribe();

      const offersChannel = supabase
        .channel(`ops-dispatch-offers-${tenantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "dispatch_offers", filter }, scheduleRefresh)
        .subscribe();

      const notificationJobsChannel = supabase
        .channel(`ops-notification-jobs-${tenantId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "notification_jobs", filter }, scheduleRefresh)
        .subscribe();

      const reconciliationChannel = supabase
        .channel(`ops-erp-reconciliation-${tenantId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "erp_reconciliation_issues", filter },
          scheduleRefresh
        )
        .subscribe();

      return () => {
        active = false;
        if (debounceRef.current) clearTimeout(debounceRef.current);
        void supabase.removeChannel(tripsChannel);
        void supabase.removeChannel(locChannel);
        void supabase.removeChannel(notesChannel);
        void supabase.removeChannel(claimsChannel);
        void supabase.removeChannel(offersChannel);
        void supabase.removeChannel(notificationJobsChannel);
        void supabase.removeChannel(reconciliationChannel);
      };
    } catch {
      return () => {
        active = false;
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
  }, [tenantId, router]);

  return null;
}
