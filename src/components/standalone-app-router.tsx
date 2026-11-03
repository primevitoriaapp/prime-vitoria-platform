"use client";

import { useEffect } from "react";

/**
 * O ícone do celular às vezes abre na página inicial (/). Se este aparelho usa o app do motorista
 * ou o app da empresa, manda direto para ele.
 */
export function StandaloneAppRouter({ mark }: { mark?: "driver" | "client" }) {
  useEffect(() => {
    try {
      if (mark) {
        localStorage.setItem("pv-app", mark);
        return;
      }
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const app = localStorage.getItem("pv-app");
      if (standalone && app === "driver") window.location.replace("/driver");
      if (standalone && app === "client") window.location.replace("/client");
    } catch {
      /* sem armazenamento */
    }
  }, [mark]);
  return null;
}
