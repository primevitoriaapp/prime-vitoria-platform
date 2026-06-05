"use server";

import type { Route } from "next";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
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
    return { error: error?.message ?? "E-mail ou senha inválidos." };
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
