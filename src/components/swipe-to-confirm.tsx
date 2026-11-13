"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

/**
 * Barra de deslizar para confirmar (estilo Uber): evita toque sem querer.
 * Arrastar o botão até o fim confirma; soltar antes volta ao começo.
 * Teclado/leitor de tela: Enter ou espaço no botão confirma.
 */
export function SwipeToConfirm({
  label,
  onConfirm,
  disabled = false,
  busy = false,
  dark = false
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
  busy?: boolean;
  dark?: boolean;
}) {
  const track = useRef<HTMLDivElement | null>(null);
  const start = useRef<{ x: number; max: number } | null>(null);
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const KNOB = 56;
  const off = disabled || busy;

  function down(e: PointerEvent<HTMLButtonElement>) {
    if (off || !track.current) return;
    const max = track.current.clientWidth - KNOB - 8;
    start.current = { x: e.clientX, max };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLButtonElement>) {
    if (!start.current) return;
    setDx(Math.max(0, Math.min(start.current.max, e.clientX - start.current.x)));
  }
  function up() {
    if (!start.current) return;
    const done = dx >= start.current.max * 0.82;
    start.current = null;
    setDragging(false);
    if (done) {
      setDx(0);
      onConfirm();
    } else setDx(0);
  }
  function key(e: KeyboardEvent<HTMLButtonElement>) {
    if (off) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onConfirm();
    }
  }

  const max = track.current ? track.current.clientWidth - KNOB - 8 : 1;
  const progress = Math.min(1, dx / Math.max(1, max));

  return (
    <div
      ref={track}
      className={`relative flex h-16 w-full select-none items-center justify-center overflow-hidden rounded-full ${dark ? "border border-[#3A3D44] bg-[#26282D]" : "bg-[#111]"} ${off ? "opacity-60" : ""}`}
      style={{ touchAction: "none" }}
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-prime-gold/25"
        style={{ width: dx + KNOB + 4, transition: dragging ? "none" : "width 200ms ease" }}
      />
      <span className="relative pl-12 pr-4 text-center text-[15px] font-bold text-[#fff]" style={{ opacity: 1 - progress * 0.8 }}>
        {busy ? "Processando…" : label}
      </span>
      <button
        type="button"
        aria-label={label}
        disabled={off}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onKeyDown={key}
        className="absolute left-1 top-1 flex h-14 w-14 items-center justify-center rounded-full bg-prime-gold shadow-md"
        style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : "transform 200ms ease", touchAction: "none" }}
      >
        <svg aria-hidden width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
