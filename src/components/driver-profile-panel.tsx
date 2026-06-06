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
    <section className="driver-card scroll-mt-6 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-[#AAAAAA]">Perfil</h2>

      {loading ? (
        <p className="mt-4 text-sm text-prime-muted">A carregar…</p>
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
              className="w-full rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300 hover:bg-red-500/20"
            >
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </section>
  );
}
