import { headers } from "next/headers";
import { resolveAppBaseUrl } from "./app-base-url.ts";

/**
 * Chamadas da propria API a partir de RSC: repassa `Cookie` do pedido HTTP
 * para `getSessionContext` resolver sessao Supabase.
 */
export async function fetchInternalApi(path: string, init?: RequestInit): Promise<Response> {
  const h = await headers();
  const cookie = h.get("cookie");
  const base = resolveAppBaseUrl();
  const url = path.startsWith("http") ? path : `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const merged = new Headers(init?.headers);
  if (cookie) merged.set("cookie", cookie);
  const tenant = h.get("x-tenant-id");
  if (tenant) merged.set("x-tenant-id", tenant);
  const xc = h.get("x-client-id");
  if (xc) merged.set("x-client-id", xc);
  const xd = h.get("x-driver-id");
  if (xd) merged.set("x-driver-id", xd);
  const role = h.get("x-role");
  if (role) merged.set("x-role", role);
  const uid = h.get("x-user-id");
  if (uid) merged.set("x-user-id", uid);
  return fetch(url, { ...init, cache: "no-store", headers: merged });
}
