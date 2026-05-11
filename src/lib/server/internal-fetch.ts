import { headers } from "next/headers";

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
}

/**
 * Chamadas da propria API a partir de RSC: repassa `Cookie` do pedido HTTP
 * para `getSessionContext` resolver sessao Supabase.
 */
export async function fetchInternalApi(path: string, init?: RequestInit): Promise<Response> {
  const h = await headers();
  const cookie = h.get("cookie");
  const base = baseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const merged = new Headers(init?.headers);
  if (cookie) merged.set("cookie", cookie);
  return fetch(url, { ...init, cache: "no-store", headers: merged });
}
