"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = {};

export function LoginForm({ defaultNext }: { defaultNext?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initial);

  return (
    <section className="card" style={{ maxWidth: 420 }}>
      <h1>Entrar</h1>
      <p style={{ fontSize: 14, color: "#475569" }}>Use a conta Supabase (email e senha).</p>
      <form action={formAction} className="grid" style={{ gap: 12 }}>
        <input type="hidden" name="next" value={defaultNext ?? ""} />
        <label style={{ display: "grid", gap: 4 }}>
          <span>Email</span>
          <input name="email" type="email" autoComplete="email" required disabled={pending} />
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span>Senha</span>
          <input name="password" type="password" autoComplete="current-password" required disabled={pending} />
        </label>
        {state.error ? (
          <p role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>
            {state.error}
          </p>
        ) : null}
        <button type="submit" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </section>
  );
}
