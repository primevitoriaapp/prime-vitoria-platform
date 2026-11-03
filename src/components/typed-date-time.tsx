"use client";

import { useEffect, useRef, useState } from "react";
import { PRIME_INPUT_CLASS } from "@/lib/ui/prime-input-class";
import { maskDate, maskTime, typedDateToYmd, typedTimeToHm, ymdToTyped } from "@/lib/dates/typed-date";

/**
 * Data e hora digitadas só com números: 03112026 vira 03/11/2026 e o cursor pula para a hora; 0300 vira 03:00.
 * O botão do calendário continua disponível para quem prefere escolher.
 */
export function TypedDateTime({
  label,
  date,
  time,
  today,
  onDate,
  onTime,
  autoFocus
}: {
  label?: string;
  date: string;
  time: string;
  today: string;
  onDate: (ymd: string) => void;
  onTime: (hm: string) => void;
  autoFocus?: boolean;
}) {
  const [dText, setDText] = useState(date ? ymdToTyped(date) : "");
  const [tText, setTText] = useState(time);
  const timeRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<HTMLInputElement | null>(null);

  // Mudança vinda de fora (ex.: calendário) atualiza o texto.
  useEffect(() => {
    if (date && typedDateToYmd(dText, today) !== date) setDText(ymdToTyped(date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const dateOk = Boolean(typedDateToYmd(dText, today));
  const timeOk = Boolean(typedTimeToHm(tText));

  return (
    <div className="grid gap-1 text-sm">
      {label ? <span className="font-semibold">{label}</span> : null}
      <div className="grid grid-cols-[1fr_auto_7rem] gap-2">
        <input
          className={`${PRIME_INPUT_CLASS} text-lg tracking-wide ${dText && !dateOk && dText.length >= 5 ? "border-red-400" : ""}`}
          inputMode="numeric"
          placeholder="dd/mm/aaaa"
          aria-label="Data"
          value={dText}
          autoFocus={autoFocus}
          onChange={(e) => {
            const v = maskDate(e.target.value);
            setDText(v);
            const ymd = typedDateToYmd(v, today);
            if (ymd) onDate(ymd);
            if (v.length === 10 && ymd) timeRef.current?.focus();
          }}
          onBlur={() => {
            const ymd = typedDateToYmd(dText, today);
            if (ymd) setDText(ymdToTyped(ymd));
          }}
        />
        <span className="relative">
          <button
            type="button"
            aria-label="Abrir calendário"
            className="flex h-full items-center rounded-lg px-3 ring-1 ring-prime-border hover:ring-prime-gold"
            onClick={() => {
              const el = pickerRef.current;
              if (!el) return;
              try {
                (el as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
              } catch {
                el.focus();
              }
            }}
          >
            📅
          </button>
          <input
            ref={pickerRef}
            type="date"
            tabIndex={-1}
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-0"
            value={date}
            onChange={(e) => {
              if (!e.target.value) return;
              onDate(e.target.value);
              setDText(ymdToTyped(e.target.value));
              timeRef.current?.focus();
            }}
          />
        </span>
        <input
          ref={timeRef}
          className={`${PRIME_INPUT_CLASS} text-lg tracking-wide ${tText.length >= 4 && !timeOk ? "border-red-400" : ""}`}
          inputMode="numeric"
          placeholder="hh:mm"
          aria-label="Horário"
          value={tText}
          onChange={(e) => {
            const v = maskTime(e.target.value);
            setTText(v);
            const hm = typedTimeToHm(v);
            onTime(hm ?? "");
          }}
        />
      </div>
      <span className="text-xs text-prime-muted">Digite só os números: 03112026 e depois 0300.</span>
    </div>
  );
}
