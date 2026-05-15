"use client";

import { createSupabaseBrowserClient } from "./browser";

/**
 * `fetch` com `Authorization: Bearer` quando ha sessao Supabase no browser.
 * Em desenvolvimento, sem sessao, opcionalmente envia `x-role` para manter demos.
 */
export async function fetchWithSupabaseSession(
  input: string,
  init: RequestInit = {},
  devFallbackRole?: "motorista" | "cliente" | "operador" | "admin" | "financeiro"
): Promise<Response> {
  let supabase: ReturnType<typeof createSupabaseBrowserClient> | null = null;
  try {
    supabase = createSupabaseBrowserClient();
  } catch {
    supabase = null;
  }

  const headers = new Headers(init.headers ?? {});
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (supabase) {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers.set("Authorization", `Bearer ${session.access_token}`);
    }
  }

  if (!headers.has("Authorization") && devFallbackRole && process.env.NODE_ENV !== "production") {
    headers.set("x-role", devFallbackRole);
  }

  return fetch(input, { ...init, headers, credentials: "include" });
}
