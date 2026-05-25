"use client";

import { useEffect } from "react";
import { DRIVER_PUSH_EVENT, setupForegroundMessaging, type DriverPushDetail } from "@/lib/firebase/messaging-foreground";

/**
 * Realtime complementar ao push: refresh silencioso + mensagem breve ao receber FCM em foreground.
 */
export function useDriverPushRefresh(
  onRefresh: () => void,
  onToast?: (detail: DriverPushDetail) => void
): void {
  useEffect(() => {
    const handler = (ev: Event) => {
      const detail = (ev as CustomEvent<DriverPushDetail>).detail;
      onRefresh();
      onToast?.(detail);
    };
    window.addEventListener(DRIVER_PUSH_EVENT, handler);

    let cleanupFg: (() => void) | null = null;
    void setupForegroundMessaging((detail) => {
      onRefresh();
      onToast?.(detail);
    }).then((cleanup) => {
      cleanupFg = cleanup;
    });

    return () => {
      window.removeEventListener(DRIVER_PUSH_EVENT, handler);
      cleanupFg?.();
    };
  }, [onRefresh, onToast]);
}
