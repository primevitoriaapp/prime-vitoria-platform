"use client";

import { useEffect } from "react";

/**
 * O ícone do celular às vezes abre na página inicial (/). Se este aparelho usa o app do motorista,
 * manda direto para ele — o link do motorista vira "só do motorista".
 */
export function StandaloneAppRouter({ mark }: { mark?: "driver" }) {
  useEffect(() => {
    try {
      if (mark) {
        localStorage.setItem("pv-app", mark);
        return;
      }
      const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (standalone && localStorage.getItem("pv-app") === "driver") window.location.replace("/driver");
    } catch {
      /* sem armazenamento */
    }
  }, [mark]);
  return null;
}
