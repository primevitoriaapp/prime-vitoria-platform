"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordResetAction, type PasswordResetState } from "../actions";

const initial: PasswordResetState = {};

export default function EsqueciSenhaPage() {
  const [state, formAction, pending] = useActionState(requestPasswordResetAction, initial);

  return (
    <main>
      <section className="card" style={{ maxWidth: 420 }}>
        <h1>Esqueci minha senha</h1>
        {state.sent ? (
          <div role="status" style={{ display: "grid", gap: 12 }}>
            <p>
              Se este e-mail tiver uma conta, você vai receber em instantes um link para criar uma senha nova. Confira
              também a caixa de spam.
            </p>
            <p style={{ fontSize: 14 }}>
              <Link href="/login" style={{ textDecoration: "underline" }}>
                Voltar para o login
              </Link>
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-prime-muted">Informe o e-mail da sua conta e enviaremos um link para criar uma senha nova.</p>
            <form action={formAction} className="grid" style={{ gap: 12 }}>
              <label style={{ display: "grid", gap: 4 }}>
                <span>Email</span>
                <input id="reset-email" name="email" type="email" autoComplete="email" required disabled={pending} />
              </label>
              {state.error ? (
                <p role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>
                  {state.error}
                </p>
              ) : null}
              <button type="submit" disabled={pending}>
                {pending ? "Enviando…" : "Enviar link"}
              </button>
            </form>
            <p style={{ marginTop: 12, fontSize: 14 }}>
              <Link href="/login" style={{ textDecoration: "underline" }}>
                Voltar para o login
              </Link>
            </p>
          </>
        )}
      </section>
    </main>
  );
}
