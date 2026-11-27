"use client";

import { useEffect, useRef } from "react";

/**
 * Botão "voltar" do celular fecha a janela aberta (detalhes, folhas) em vez de sair do app.
 * Ao abrir, cria um passo no histórico; o voltar remove esse passo e chama `close`.
 * Fechando pelo próprio botão da tela, o passo extra é desfeito.
 */
export function useBackToClose(open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const marker = { pvOverlay: Math.random() };
    window.history.pushState(marker, "");
    let poppedByBack = false;
    const openedAt = Date.now();
    const onPop = () => {
      // Volta disparada por outra janela que acabou de fechar (troca de uma janela por outra): ignora.
      if (Date.now() - openedAt < 400) return;
      poppedByBack = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // Fechou pela tela: tira o passo que foi criado ao abrir.
      if (!poppedByBack && (window.history.state as { pvOverlay?: number } | null)?.pvOverlay === marker.pvOverlay) window.history.back();
    };
  }, [open]);
}
