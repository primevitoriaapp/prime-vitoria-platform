"use server";

import type { Route } from "next";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { postLoginPathForRole } from "@/lib/auth/post-login-path";
import { resolveLoginRole } from "@/lib/auth/resolve-login-role";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export type LoginState = { error?: string };

function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://") || path.includes("@")) return false;
  return path.length < 512;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  try {
    enforceRateLimit(`login:${ip}`, 10, 60_000);
  } catch {
    return { error: "Muitas tentativas. Tente novamente em instantes." };
  }

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextRaw = String(formData.get("next") ?? "").trim();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { error: "Supabase não configurado (URL/chave anônima)." };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options as CookieOptions | undefined)
        );
      }
    }
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    const raw = error?.message ?? "";
    if (/invalid login credentials/i.test(raw)) {
      return { error: "E-mail ou senha incorretos." };
    }
    if (/email not confirmed/i.test(raw)) {
      return { error: "Este e-mail ainda não foi confirmado." };
    }
    return { error: raw || "E-mail ou senha incorretos." };
  }

  const role = await resolveLoginRole(data.user);

  await supabase.auth.updateUser({
    data: { ...(data.user.user_metadata ?? {}), role }
  });

  if (role === "motorista") {
    redirect("/driver");
  }
  if (isSafeInternalPath(nextRaw)) {
    redirect(nextRaw as Route);
  }
  redirect(postLoginPathForRole(role) as Route);
}

export async function logoutAction(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    redirect("/");
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options as CookieOptions | undefined)
        );
      }
    }
  });

  await supabase.auth.signOut();
  redirect("/");
}

export type PasswordResetState = { sent?: boolean; error?: string };

/**
 * Envia o e-mail de redefinição de senha (Supabase Auth).
 * Fluxo "implicit": o link traz o acesso no próprio endereço, então funciona
 * mesmo se a pessoa abrir o e-mail em outro aparelho.
 * Responde sempre "enviado" para não revelar quais e-mails têm conta.
 */
export async function requestPasswordResetAction(
  _prev: PasswordResetState,
  formData: FormData
): Promise<PasswordResetState> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  try {
    enforceRateLimit(`password-reset:${ip}`, 5, 10 * 60_000);
  } catch {
    return { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@") || email.length > 254) {
    return { error: "Informe um e-mail válido." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { error: "Supabase não configurado (URL/chave anônima)." };
  }

  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host");
  const proto = hdrs.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${proto}://${host}` : process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (!origin) {
    return { error: "Não foi possível montar o link de redefinição." };
  }

  const supabase = createClient(url, key, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/redefinir-senha`
  });
  if (error) {
    console.warn("[password-reset] falha ao enviar", { message: error.message });
    if (/rate limit/i.test(error.message)) {
      return { error: "Limite de e-mails atingido. Tente de novo em alguns minutos." };
    }
  }
  return { sent: true };
}
