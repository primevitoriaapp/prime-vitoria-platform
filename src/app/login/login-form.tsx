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
    <div className="grid min-h-screen bg-prime-bg lg:grid-cols-[1.05fr_1fr]">
      {/* Lado da marca */}
      <aside className="relative flex flex-col justify-between overflow-hidden bg-[#111] px-6 py-8 text-white lg:px-14 lg:py-14">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, #C9A84C 0, transparent 40%), radial-gradient(circle at 90% 90%, #C9A84C 0, transparent 35%)"
          }}
          aria-hidden
        />
        <div className="relative flex items-center gap-3">
          <PrimeLogoMark size={48} />
          <div className="leading-tight">
            <p className="text-lg font-semibold tracking-tight">Prime Vitória</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-prime-gold">Transporte executivo</p>
          </div>
        </div>
        <div className="relative mt-8 hidden max-w-md lg:block">
          <p className="font-prime-display text-4xl leading-tight">
            Sua mobilidade executiva, <span className="text-prime-gold">organizada em um só lugar.</span>
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/70">
            <li>• Peça corridas com data e horário marcados</li>
            <li>• Acompanhe o motorista e o veículo de cada viagem</li>
            <li>• Voucher e histórico da sua empresa sempre à mão</li>
          </ul>
        </div>
        <p className="relative mt-6 hidden text-xs text-white/40 lg:block">Espírito Santo e principais capitais do Brasil</p>
      </aside>

      {/* Formulário */}
      <main className="flex items-start justify-center px-5 py-8 sm:items-center lg:px-12">
        <div className="w-full max-w-sm">
          <h1 className="font-prime-display text-3xl text-prime-text">Entrar</h1>
          <p className="mt-2 text-sm text-prime-muted">Use o e-mail e a senha da sua conta.</p>

          <form action={formAction} className="mt-8 grid gap-4">
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
              <span className="flex items-center justify-between">
                Senha
                <Link href="/login/esqueci-senha" className="text-xs font-normal text-prime-gold hover:underline">
                  Esqueci minha senha
                </Link>
              </span>
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
              className="mt-2 w-full rounded-lg bg-[#111] px-4 py-3 text-base font-semibold text-white transition hover:bg-black disabled:opacity-60"
            >
              {pending ? "Entrando…" : "Entrar"}
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-prime-border bg-white p-4 text-sm text-prime-muted">
            <p className="font-medium text-prime-text">Primeiro acesso?</p>
            <p className="mt-1">
              Funcionários recebem um convite por e-mail do gestor da empresa. Abra o convite e crie sua senha.
            </p>
            <p className="mt-3">
              <Link href="/driver/login" className="text-prime-gold hover:underline">
                Sou motorista →
              </Link>
            </p>
          </div>

          {staging ? (
            <p className="mt-6 text-xs">
              <Link href="/p1-homologacao" className="text-violet-700 underline">
                Homologação P1
              </Link>
              {" · "}
              <Link href="/staging-status" className="text-violet-700 underline">
                Status do ambiente
              </Link>
            </p>
          ) : null}
          <LoginStagingAccounts defaultNext={defaultNext} />
        </div>
      </main>
    </div>
  );
}
