"use client";

import Link from "next/link";
import { useActionState } from "react";
import { driverPinLoginAction, type DriverPinLoginState } from "./actions";

const initial: DriverPinLoginState = {};

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

export function DriverPinLoginForm({ defaultNext }: { defaultNext?: string }) {
  const [state, formAction, pending] = useActionState(driverPinLoginAction, initial);

  return (
    <section className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/90 p-6 shadow-xl">
      <p className="text-xs uppercase tracking-widest text-amber-500/90">Prime Vitória</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Acesso motorista</h1>
      <p className="mt-2 text-sm text-slate-400">
        Digite seu CPF e o PIN de 4 dígitos definido pelo operador. Não precisa de e-mail.
      </p>

      <form action={formAction} className="mt-6 grid gap-4">
        <input type="hidden" name="next" value={defaultNext ?? ""} />
        <label className="grid gap-1.5 text-sm text-slate-200">
          <span>CPF</span>
          <input
            name="cpf"
            type="text"
            inputMode="numeric"
            autoComplete="username"
            required
            disabled={pending}
            placeholder="000.000.000-00"
            className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-base text-white"
            onChange={(e) => {
              e.target.value = formatCpfInput(e.target.value);
            }}
          />
        </label>
        <label className="grid gap-1.5 text-sm text-slate-200">
          <span>PIN (4 dígitos)</span>
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            autoComplete="current-password"
            required
            disabled={pending}
            placeholder="••••"
            className="rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-center text-2xl tracking-[0.5em] text-white"
          />
        </label>
        {state.error ? (
          <p role="alert" className="rounded-lg border border-red-500/40 bg-red-950/50 px-3 py-2 text-sm text-red-200">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-amber-500 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60"
        >
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">
        Operador ou admin?{" "}
        <Link href="/login" className="text-amber-500/90 underline">
          Login com e-mail
        </Link>
      </p>
    </section>
  );
}
