"use server";

import type { Route } from "next";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ensureDriverAuthAccount } from "@/lib/auth/ensure-driver-auth-account";
import { isValidDriverPin, verifyDriverPin } from "@/lib/auth/driver-pin-crypto";
import { normalizeCpfDigits } from "@/lib/drivers/resolve-driver-for-session";
import { db } from "@/lib/server/db";
import { enforceRateLimit } from "@/lib/security/rate-limit";

export type DriverPinLoginState = { error?: string };

function isSafeInternalPath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return false;
  if (path.includes("://") || path.includes("@")) return false;
  return path.length < 512;
}

export async function driverPinLoginAction(
  _prev: DriverPinLoginState,
  formData: FormData
): Promise<DriverPinLoginState> {
  const hdrs = await headers();
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  try {
    enforceRateLimit(`driver-pin:${ip}`, 8, 60_000);
  } catch {
    return { error: "Muitas tentativas. Aguarde um minuto e tente novamente." };
  }

  const cpfDigits = normalizeCpfDigits(String(formData.get("cpf") ?? ""));
  const pin = String(formData.get("pin") ?? "").trim();
  const nextRaw = String(formData.get("next") ?? "").trim();

  if (cpfDigits.length !== 11) {
    return { error: "Informe um CPF válido (11 dígitos)." };
  }
  if (!isValidDriverPin(pin)) {
    return { error: "PIN deve ter 4 dígitos numéricos." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return { error: "Supabase não configurado." };
  }

  const { data: drivers, error: driverErr } = await db
    .from("drivers")
    .select("id, cpf, email, full_name, profile_id, tenant_id, active, pin_hash")
    .eq("active", true)
    .not("pin_hash", "is", null)
    .limit(500);

  if (driverErr) {
    return { error: "Não foi possível validar o acesso. Tente novamente." };
  }

  const driver = (drivers ?? []).find((row) => normalizeCpfDigits(String(row.cpf ?? "")) === cpfDigits);
  if (!driver?.pin_hash) {
    return {
      error:
        "CPF ou PIN incorreto. Se ainda não tem PIN, peça ao operador para definir na ficha do motorista."
    };
  }

  if (!verifyDriverPin(pin, driver.pin_hash as string)) {
    return { error: "CPF ou PIN incorreto." };
  }

  let authEmail: string;
  let authPassword: string;
  try {
    const auth = await ensureDriverAuthAccount({
      id: driver.id as string,
      cpf: driver.cpf as string,
      email: driver.email as string | null,
      full_name: driver.full_name as string | null,
      profile_id: driver.profile_id as string | null,
      tenant_id: driver.tenant_id as string
    });
    authEmail = auth.email;
    authPassword = auth.password;
  } catch {
    return { error: "Não foi possível preparar o acesso. Contacte o operador." };
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

  const { data, error } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: authPassword
  });

  if (error || !data.user) {
    return { error: "Falha ao iniciar sessão. Tente novamente ou contacte o operador." };
  }

  await supabase.auth.updateUser({
    data: {
      ...(data.user.user_metadata ?? {}),
      role: "motorista",
      cpf: cpfDigits
    }
  });

  if (isSafeInternalPath(nextRaw) && nextRaw.startsWith("/driver")) {
    redirect(nextRaw as Route);
  }
  redirect("/driver");
}

export async function driverLogoutAction(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    redirect("/driver/login");
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
  redirect("/driver/login");
}
