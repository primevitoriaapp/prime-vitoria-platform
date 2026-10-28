"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type Phase = "checking" | "ready" | "invalid" | "saving" | "done";

/**
 * Página aberta pelo link do e-mail "Esqueci minha senha".
 * O link traz o acesso temporário no endereço (#access_token…); a página
 * lê esse acesso, deixa a pessoa criar a senha nova e encerra a sessão.
 */
export default function RedefinirSenhaPage() {
  const supabase = useMemo<SupabaseClient | null>(() => {
    if (typeof window === "undefined") return null;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: {
        flowType: "implicit",
        detectSessionInUrl: true,
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }, []);

  const [phase, setPhase] = useState<Phase>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setPhase("invalid");
      return;
    }
    let cancelled = false;
    const hash = window.location.hash;
    const hashError = new URLSearchParams(hash.replace(/^#/, "")).get("error_description");

    const check = async () => {
      // O cliente lê o #access_token sozinho; damos um instante para isso.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setPhase("ready");
        // Remove o token do endereço (não fica no histórico).
        window.history.replaceState(null, "", window.location.pathname);
      } else {
        setError(hashError ? "Este link expirou ou já foi usado." : null);
        setPhase("invalid");
      }
    };

    const timer = window.setTimeout(() => void check(), 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [supabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As duas senhas não são iguais.");
      return;
    }
    if (!supabase) return;
    setPhase("saving");
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setError(
        /different from the old/i.test(updateError.message)
          ? "A senha nova precisa ser diferente da anterior."
          : "Não foi possível salvar a senha. Peça um link novo e tente de novo."
      );
      setPhase("ready");
      return;
    }
    await supabase.auth.signOut();
    setPhase("done");
  };

  return (
    <main>
      <section className="card" style={{ maxWidth: 420 }}>
        <h1>Criar senha nova</h1>

        {phase === "checking" ? <p>Conferindo o link…</p> : null}

        {phase === "invalid" ? (
          <div style={{ display: "grid", gap: 12 }}>
            <p>{error ?? "Este link não é válido ou já expirou."} Peça um link novo.</p>
            <p style={{ fontSize: 14 }}>
              <Link href="/login/esqueci-senha" style={{ textDecoration: "underline" }}>
                Pedir link novo
              </Link>
            </p>
          </div>
        ) : null}

        {phase === "ready" || phase === "saving" ? (
          <form onSubmit={submit} className="grid" style={{ gap: 12 }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Senha nova</span>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={phase === "saving"}
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span>Repita a senha nova</span>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                minLength={8}
                disabled={phase === "saving"}
              />
            </label>
            {error ? (
              <p role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>
                {error}
              </p>
            ) : null}
            <button type="submit" disabled={phase === "saving"}>
              {phase === "saving" ? "Salvando…" : "Salvar senha"}
            </button>
          </form>
        ) : null}

        {phase === "done" ? (
          <div role="status" style={{ display: "grid", gap: 12 }}>
            <p>Senha salva. Agora é só entrar com a senha nova.</p>
            <p style={{ fontSize: 14 }}>
              <Link href="/login" style={{ textDecoration: "underline" }}>
                Ir para o login
              </Link>
            </p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
