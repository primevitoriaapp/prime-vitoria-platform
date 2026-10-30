"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { PrimeLogoMark } from "@/components/prime-logo-mark";
import { driverPinLoginAction, type DriverPinLoginState } from "./actions";

const initial: DriverPinLoginState = {};

const FIELD =
  "w-full rounded-xl border border-prime-input-border bg-white px-4 py-3.5 text-base text-prime-text outline-none transition placeholder:text-gray-400 focus:border-prime-gold focus:ring-2 focus:ring-prime-gold/25 disabled:opacity-60";

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/** Tela de entrada exclusiva do motorista: logo no centro, boas-vindas e cartão com CPF + PIN. */
export function DriverPinLoginForm({ defaultNext }: { defaultNext?: string }) {
  const [state, formAction, pending] = useActionState(driverPinLoginAction, initial);
  const [showPin, setShowPin] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col items-center bg-[#111] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))] sm:justify-center">
      <div className="mb-6 flex flex-col items-center text-center">
        <PrimeLogoMark size={84} />
        <p className="mt-3 text-lg font-semibold tracking-tight" style={{ color: "#fff" }}>
          Prime Vitória
        </p>
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-prime-gold">Transporte executivo</p>
      </div>

      <section className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h1 className="font-prime-display text-2xl text-prime-text">Seja bem-vindo, motorista</h1>
        <p className="mt-1 text-sm text-prime-muted">Entre com seu CPF e o PIN de 4 dígitos que a central passou para você.</p>

        <form action={formAction} className="mt-6 grid gap-4">
          <input type="hidden" name="next" value={defaultNext ?? ""} />
          <label className="grid gap-1.5 text-sm font-medium text-prime-text">
            CPF
            <input
              name="cpf"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              required
              disabled={pending}
              placeholder="000.000.000-00"
              className={FIELD}
              onChange={(e) => {
                e.target.value = formatCpfInput(e.target.value);
              }}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-prime-text">
            PIN
            <span className="relative">
              <input
                name="pin"
                type={showPin ? "text" : "password"}
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                autoComplete="current-password"
                required
                disabled={pending}
                placeholder="••••"
                className={`${FIELD} pr-16 text-center text-2xl tracking-[0.5em]`}
              />
              <button
                type="button"
                onClick={() => setShowPin((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-prime-gold"
              >
                {showPin ? "Ocultar" : "Ver"}
              </button>
            </span>
          </label>
          {state.error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {state.error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-xl bg-prime-gold px-4 py-3.5 text-base font-semibold text-[#111] transition hover:bg-prime-gold-hover disabled:opacity-60"
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <p className="mt-5 border-t border-prime-border pt-4 text-xs leading-relaxed text-prime-muted">
          <span className="font-medium text-prime-text">Esqueceu o PIN?</span> Fale com a central da Prime para receber um novo.
        </p>
        <p className="mt-3 text-center text-xs text-prime-muted">
          Ao entrar você concorda com os{" "}
          <Link href="/privacidade" className="underline">
            termos de uso e a política de privacidade
          </Link>
          .
        </p>
      </section>

      <p className="mt-6 text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
        É da central?{" "}
        <Link href="/login" className="text-prime-gold hover:underline">
          Entrar com e-mail
        </Link>
      </p>
    </div>
  );
}
