"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AUTH_BUTTON, AUTH_FIELD, AuthCard } from "@/components/auth-card";
import { requestPasswordResetAction, type PasswordResetState } from "../actions";

const initial: PasswordResetState = {};

export default function EsqueciSenhaPage() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initial);

  return (
    <AuthCard title="Esqueci minha senha">
      {state.sent ? (
        <div role="status" className="grid gap-3">
          <p>
            Se este e-mail tiver uma conta, você vai receber em instantes um link para criar uma senha nova. Confira
            também a caixa de spam.
          </p>
          <Link href="/login" className="text-prime-gold hover:underline">
            ← Voltar para o login
          </Link>
        </div>
      ) : (
        <>
          <p className="text-prime-muted">Informe o e-mail da sua conta e enviaremos um link para criar uma senha nova.</p>
          <form action={formAction} className="grid gap-4">
            <label className="grid gap-1.5 font-medium">
              E-mail
              <input id="reset-email" name="email" type="email" autoComplete="email" required disabled={pending} className={AUTH_FIELD} />
            </label>
            {state.error ? (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-800">
                {state.error}
              </p>
            ) : null}
            <button type="submit" disabled={pending} className={AUTH_BUTTON}>
              {pending ? "Enviando…" : "Enviar link"}
            </button>
          </form>
          <Link href="/login" className="text-prime-gold hover:underline">
            ← Voltar para o login
          </Link>
        </>
      )}
    </AuthCard>
  );
}
