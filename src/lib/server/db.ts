import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

function getOrCreateClient(): SupabaseClient {
  if (client) return client;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

  if (!supabaseUrl || !serviceRole) {
    throw new Error(
      "Supabase nao configurado: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ex.: CI e .env.local)."
    );
  }

  client = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false }
  });
  return client;
}

export const db = new Proxy({} as SupabaseClient, {
  get(_target, prop, _receiver) {
    const real = getOrCreateClient();
    const value = (real as unknown as Record<PropertyKey, unknown>)[prop];
    if (typeof value === "function") {
      return (value as (...args: unknown[]) => unknown).bind(real);
    }
    return value;
  }
});
