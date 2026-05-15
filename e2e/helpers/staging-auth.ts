/**
 * Autenticação Supabase para Playwright contra staging (password grant).
 * Requer: PLAYWRIGHT_BASE_URL ou BASE_URL, NEXT_PUBLIC_SUPABASE_* , STAGING_E2E_PASSWORD
 */

export const stagingEmailByRole: Record<string, string> = {
  admin: "staging-admin@example.com",
  operador: "staging-operador@example.com",
  financeiro: "staging-financeiro@example.com",
  motorista: "staging-motorista@example.com",
  cliente: "staging-cliente@example.com"
};

export type StagingAuthConfig = {
  baseUrl: string;
  supabaseUrl: string;
  anonKey: string;
  password: string;
  role: string;
  email: string;
};

export function getStagingAuthConfig(): StagingAuthConfig | null {
  const baseUrl = (process.env.PLAYWRIGHT_BASE_URL ?? process.env.BASE_URL ?? "").replace(/\/$/, "");
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const password = process.env.STAGING_E2E_PASSWORD ?? "";
  const role = process.env.STAGING_E2E_ROLE ?? "operador";
  const email = process.env.STAGING_E2E_EMAIL ?? stagingEmailByRole[role] ?? stagingEmailByRole.operador;

  if (!baseUrl || !supabaseUrl || !anonKey || !password) {
    return null;
  }

  return { baseUrl, supabaseUrl, anonKey, password, role, email };
}

export function stagingTestsEnabled(): boolean {
  return process.env.PLAYWRIGHT_STAGING === "1" && getStagingAuthConfig() != null;
}

export async function signInStaging(config: StagingAuthConfig): Promise<string> {
  const res = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: config.anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: config.email, password: config.password })
  });
  const json = (await res.json()) as { access_token?: string; error_description?: string; msg?: string };
  if (!res.ok || !json.access_token) {
    throw new Error(`Staging auth failed: ${json.error_description ?? json.msg ?? res.status}`);
  }
  return json.access_token;
}
