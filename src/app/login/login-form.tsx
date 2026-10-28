"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { LoginStagingAccounts } from "@/components/login-staging-accounts";
import { PrimeLogoMark } from "@/components/prime-logo-mark";
import { isStagingSmokeHintsEnabled } from "@/lib/staging/smoke-hints";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

const FIELD =
  "w-full rounded-lg border border-prime-input-border bg-white px-3.5 py-3 text-base text-prime-text outline-none transition placeholder:text-gray-400 focus:border-prime-gold focus:ring-2 focus:ring-prime-gold/25 disabled:opacity-60";

export function LoginForm({ defaultNext }: { defaultNext?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);
  const [showPassword, setShowPassword] = useState(false);
  const staging = isStagingSmokeHintsEnabled();

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#111] px-5 py-10 sm:justify-center">
      <div className="mb-6 flex flex-col items-center text-center">
        <PrimeLogoMark size={72} />
        <p className="mt-3 text-lg font-semibold tracking-tight text-white">Prime Vitória</p>
        <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-prime-gold">Transporte executivo</p>
      </div>

      <section className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <h1 className="font-prime-display text-2xl text-prime-text">Entrar</h1>
        <p className="mt-1 text-sm text-prime-muted">Use o e-mail e a senha da sua conta.</p>

        <form action={formAction} className="mt-6 grid gap-4">
          <input type="hidden" name="next" value={defaultNext ?? ""} />
          <label className="grid gap-1.5 text-sm font-medium text-prime-text">
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="seu.nome@empresa.com.br"
              required
              disabled={pending}
              className={FIELD}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium text-prime-text">
            Senha
            <span className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={pending}
                className={`${FIELD} pr-16`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-2 my-auto h-8 rounded-md px-2 text-xs text-prime-muted hover:text-prime-text"
              >
                {showPassword ? "Ocultar" : "Mostrar"}
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
            className="w-full rounded-lg bg-prime-gold px-4 py-3 text-base font-semibold text-[#111] transition hover:bg-prime-gold-hover disabled:opacity-60"
          >
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div className="mt-4 text-center text-sm">
          <Link href="/login/esqueci-senha" className="text-prime-gold hover:underline">
            Esqueci minha senha
          </Link>
        </div>

        <p className="mt-6 border-t border-prime-border pt-4 text-xs leading-relaxed text-prime-muted">
          <span className="font-medium text-prime-text">Primeiro acesso?</span> Funcionários recebem um convite por e-mail
          do gestor da empresa. Abra o convite e crie sua senha.
        </p>
      </section>

      <p className="mt-6 text-sm text-white/60">
        É motorista?{" "}
        <Link href="/driver/login" className="text-prime-gold hover:underline">
          Entrar com CPF e PIN
        </Link>
      </p>

      {staging ? (
        <p className="mt-4 text-xs text-white/50">
          <Link href="/p1-homologacao" className="underline">
            Homologação P1
          </Link>
          {" · "}
          <Link href="/staging-status" className="underline">
            Status do ambiente
          </Link>
        </p>
      ) : null}
      <LoginStagingAccounts defaultNext={defaultNext} />
    </div>
  );
}
