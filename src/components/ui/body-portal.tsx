"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const THEMES = ["admin-theme", "driver-theme", "prime-theme"];

/**
 * Leva janelas, folhas de baixo e avisos flutuantes para o fim do <body>.
 * Assim nada os corta: nem a área que rola do painel, nem a barra de baixo do celular,
 * nem elementos com desfoque/animação (no Safari do iPhone eles "prendem" o que é fixo).
 * Mantém o tema (cores dos campos) do lugar onde a janela foi aberta.
 */
export function BodyPortal({ children }: { children: ReactNode }) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [target, setTarget] = useState<{ el: HTMLElement; theme: string } | null>(null);
  useEffect(() => {
    const host = anchor.current?.closest(THEMES.map((t) => `.${t}`).join(","));
    const theme = host ? THEMES.filter((t) => host.classList.contains(t)).join(" ") : "";
    setTarget({ el: document.body, theme });
  }, []);
  return (
    <>
      <span ref={anchor} hidden aria-hidden />
      {target ? createPortal(<div className={target.theme} style={{ display: "contents" }}>{children}</div>, target.el) : null}
    </>
  );
}
