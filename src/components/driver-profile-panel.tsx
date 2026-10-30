"use client";

import { useCallback, useEffect, useState } from "react";
import { driverLogoutAction } from "@/app/(driver)/driver/login/actions";
import { maskCpfDigits } from "@/lib/drivers/mask-cpf";
import { fetchWithSupabaseSession } from "@/lib/supabase/auth-fetch";

type Profile = {
  id: string;
  cpf: string;
  profile_name: string | null;
  full_name: string | null;
  photo_url: string | null;
};

type Props = {
  devFallbackRole?: "motorista" | "admin";
};

export function DriverProfilePanel({ devFallbackRole = "motorista" }: Props) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    const res = await fetchWithSupabaseSession("/api/drivers/me", {}, devFallbackRole);
    const json = (await res.json()) as {
      success?: boolean;
      data?: Profile;
      error?: { message?: string };
    };
    if (!res.ok || !json.success) {
      setProfile(null);
      setMessage(json.error?.message ?? "Não foi possível carregar o perfil.");
      setLoading(false);
      return;
    }
    setProfile(json.data ?? null);
    setLoading(false);
  }, [devFallbackRole]);

  useEffect(() => {
    void load();
  }, [load]);

  const displayName =
    profile?.profile_name?.trim() || profile?.full_name?.trim() || "Motorista";

  return (
    <section className="scroll-mt-6 rounded-3xl border border-[#ECE7DB] bg-white p-5 shadow-[0_8px_30px_rgba(0,0,0,0.05)]">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#8A8A8A]">Perfil</h2>

      {loading ? (
        <p className="mt-4 text-sm text-prime-muted">Carregando…</p>
      ) : message ? (
        <p className="mt-4 text-sm text-red-400">{message}</p>
      ) : profile ? (
        <div className="mt-4 flex flex-col items-center gap-4 text-center">
          <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full border-2 border-prime-gold/40 bg-prime-surface">
            {profile.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.photo_url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-3xl font-semibold text-prime-gold" aria-hidden>
                {displayName.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div>
            <p className="text-lg font-semibold text-prime-text">{displayName}</p>
            <p className="mt-1 text-sm text-prime-muted">CPF {maskCpfDigits(profile.cpf)}</p>
          </div>
          <form action={driverLogoutAction} className="w-full max-w-xs">
            <button
              type="submit"
              className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
            >
              Sair do app
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
