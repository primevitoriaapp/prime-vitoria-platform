"use client";

import { useEffect, useState, type ReactNode } from "react";
import { driverLogoutAction } from "@/app/(driver)/driver/login/actions";
import { DriverAccountEditor } from "@/components/driver-account-editor";
import { PartyContractsCard } from "@/components/party-contracts-card";
import { DriverMessagesList } from "@/components/driver-messages-inbox";
import { InstallAppCard } from "@/components/install-app-card";
import { PushSetup } from "@/components/push-setup";
import { fmtRating, type DriverSummary } from "@/components/driver-app-home";

type Me = {
  profile_name: string | null;
  full_name: string | null;
  photo_url: string | null;
  vehicle: { model: string; plate: string; brand?: string | null; color?: string | null; category?: string | null } | null;
};

type Item = { id: string; label: string; icon: string; badge?: ReactNode };

const ICON = {
  dados: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 4-6 8-6s8 2 8 6",
  avisos: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  contratos: "M4 4h16v16H4zM8 9h8M8 13h5M14 17l2 2 3-4",
  notificacoes: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  pin: "M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4",
  termos: "M14 3H6v18h12V7zM14 3v4h4M9 12h6M9 16h6"
};

/** Perfil em lista (como a 99): cada item abre a sua tela. */
export function DriverProfileMenu({ me, summary, pinCard }: { me: Me | null; summary: DriverSummary | null; devRole: "motorista" | "admin"; pinCard: ReactNode }) {
  const [open, setOpen] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    void fetch("/api/drivers/me/messages", { credentials: "include" })
      .then((r) => r.json())
      .then((j: { data?: { live: boolean; read_at: string | null }[] }) => setUnread((j.data ?? []).filter((m) => m.live && !m.read_at).length))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    if (open) window.scrollTo({ top: 0 });
  }, [open]);

  const name = me?.profile_name || me?.full_name || "Motorista";
  const month = summary ? summary.today.slice(0, 7) : null;
  const monthTrips = month ? (summary?.months[month]?.trips ?? 0) : null;
  const since = summary?.since ? new Date(summary.since).getFullYear() : null;
  const sub = [summary?.rating != null ? fmtRating(summary.rating) : null, monthTrips != null ? `${monthTrips} corrida${monthTrips === 1 ? "" : "s"} no mês` : null, since ? `desde ${since}` : null]
    .filter(Boolean)
    .join(" · ");

  const items: Item[] = [
    { id: "dados", label: "Meus dados, carro e documentos", icon: ICON.dados },
    {
      id: "avisos",
      label: "Avisos da central",
      icon: ICON.avisos,
      badge: unread ? <span className="rounded-full bg-[#C0392B] px-2 py-0.5 text-xs font-bold text-white">{unread}</span> : null
    },
    { id: "contratos", label: "Contratos", icon: ICON.contratos },
    { id: "notificacoes", label: "Notificações e instalar o app", icon: ICON.notificacoes },
    { id: "pin", label: "PIN de acesso", icon: ICON.pin }
  ];
  const current = items.find((i) => i.id === open);

  if (current)
    return (
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-[#F6F4EF] pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <div className="sticky top-0 z-10 bg-[#F6F4EF]/95 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <button type="button" onClick={() => setOpen(null)} aria-label="Voltar" className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
            <h2 className="text-xl font-extrabold">{current.label}</h2>
          </div>
        </div>
        <div className="mx-auto max-w-lg space-y-4 px-4 pt-2">
          {open === "dados" ? <DriverAccountEditor /> : null}
          {open === "avisos" ? <DriverMessagesList /> : null}
          {open === "contratos" ? <PartyContractsCard audience="motorista" /> : null}
          {open === "notificacoes" ? (
            <>
              <PushSetup audience="motorista" />
              <InstallAppCard dismissible={false} />
            </>
          ) : null}
          {open === "pin" ? pinCard : null}
        </div>
      </div>
    );

  const v = me?.vehicle;
  return (
    <section className="-mx-4 px-5">
      <div className="flex items-center gap-3.5">
        {me?.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.photo_url} alt="" className="h-16 w-16 shrink-0 rounded-full border-[3px] border-prime-gold object-cover" />
        ) : (
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-prime-gold bg-[#F3EBD6] text-2xl font-extrabold text-[#5E4812]">{name.charAt(0).toUpperCase()}</span>
        )}
        <div className="min-w-0">
          <p className="truncate text-[22px] font-extrabold leading-tight">{name}</p>
          {sub ? <p className="mt-0.5 text-sm text-[#5C6067]">{sub}</p> : null}
        </div>
      </div>

      {v ? (
        <button type="button" onClick={() => setOpen("dados")} className="mt-4 flex w-full items-center justify-between rounded-[18px] bg-[#FBF5E6] px-4 py-3.5 text-left">
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold">
              {[v.brand, v.model].filter(Boolean).join(" ")}
              {v.color ? ` · ${v.color}` : ""}
            </span>
            <span className="block text-[13px] text-[#5E4812]">
              Placa {v.plate}
              {v.category ? ` · ${v.category}` : ""}
            </span>
          </span>
          <span className="text-[13px] font-bold text-[#5E4812]">Trocar</span>
        </button>
      ) : null}

      <ul className="mt-2">
        {items.map((i) => (
          <li key={i.id}>
            <button type="button" onClick={() => setOpen(i.id)} className="flex w-full items-center gap-3.5 border-b border-[#F0ECE3] py-4 text-left text-[17px] font-semibold">
              <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={i.icon} />
              </svg>
              <span className="flex-1">{i.label}</span>
              {i.badge}
              <span aria-hidden className="text-[#A8ACB3]">›</span>
            </button>
          </li>
        ))}
        <li>
          <a href="/privacidade" className="flex w-full items-center gap-3.5 border-b border-[#F0ECE3] py-4 text-[17px] font-semibold text-[#111]">
            <svg aria-hidden width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICON.termos} />
            </svg>
            <span className="flex-1">Termos de uso e privacidade</span>
            <span aria-hidden className="text-[#A8ACB3]">›</span>
          </a>
        </li>
      </ul>

      <form action={driverLogoutAction} className="mt-6">
        <button type="submit" className="w-full rounded-2xl py-3.5 text-[15px] font-semibold text-[#C0392B] ring-1 ring-[#F2D6D2]">
          Sair do app
        </button>
      </form>
    </section>
  );
}
