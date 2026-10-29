"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { BrandLogo } from "@/components/brand-logo";
import { NewTripRequestAlert } from "@/components/new-trip-request-alert";
import { ReceivablesAlertPill } from "@/components/receivables-alert-pill";
import { PendingRequestsPill } from "@/components/pending-requests-pill";
import { NotificationsBell } from "@/components/notifications-bell";
import { papelUsuarioPt } from "@/lib/i18n/pt-br";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▣" },
  { href: "/ao-vivo", label: "Ao vivo", icon: "◍" },
  { href: "/dispatch", label: "Despacho", icon: "◎" },
  { href: "/agenda", label: "Agenda", icon: "◷" },
  { href: "/whatsapp", label: "WhatsApp", icon: "✆" },
  { href: "/drivers", label: "Motoristas", icon: "◉" },
  { href: "/categorias", label: "Categorias", icon: "◇" },
  { href: "/vehicles", label: "Veículos", icon: "▤" },
  { href: "/clients", label: "Clientes", icon: "▦" },
  { href: "/finance", label: "Financeiro", icon: "◈" }
] as const;

const ADMIN_EXTRA = [
  { href: "/configuracoes", label: "Configurações" },
  { href: "/integracoes", label: "Integrações" },
  { href: "/users", label: "Usuários" },
  { href: "/audit", label: "Auditoria" },
  { href: "/driver", label: "App motorista" },
  { href: "/client", label: "Portal cliente" }
] as const;

type SessionPayload = { role: string; tenantId?: string | null };

function navClass(active: boolean) {
  return [
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
    active ? "prime-nav-active" : "prime-nav-item hover:bg-prime-sidebar-hover"
  ].join(" ");
}

export function AdminAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<SessionPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.success && body?.data?.role && body.data.role !== "guest") {
          setSession({ role: body.data.role, tenantId: body.data.tenantId ?? null });
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const isAdmin = session?.role === "admin";
  const isFinanceiro = session?.role === "financeiro";
  const isOperador = session?.role === "operador";
  const showFullNav = session?.role === "admin" || session?.role === "operador";

  const visibleNav = showFullNav
    ? NAV
    : isFinanceiro
      ? NAV.filter((n) => n.href === "/finance" || n.href === "/dashboard")
      : NAV;

  return (
    <div className="admin-theme flex h-dvh flex-col overflow-hidden bg-prime-bg text-prime-text">
      <div className="flex min-h-0 flex-1">
        <aside className="prime-sidebar hidden h-full w-60 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-prime-sidebar md:flex">
          <div className="border-b border-white/10 px-4 py-5">
            <Link href="/dashboard">
              <BrandLogo variant="dark" />
            </Link>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Operação">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-prime-sidebar-text">
              Operação
            </p>
            {visibleNav.map((item) => (
              <Link key={item.href} href={item.href} className={navClass(isActivePath(pathname, item.href))}>
                <span className="w-5 text-center text-xs opacity-70" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="space-y-1 border-t border-white/10 px-3 py-4">
            {isAdmin
              ? ADMIN_EXTRA.map((item) => (
                  <Link key={item.href} href={item.href} className={navClass(isActivePath(pathname, item.href))}>
                    {item.label}
                  </Link>
                ))
              : null}
            <form action={logoutAction} className="px-1 pt-2">
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-prime-sidebar-text hover:bg-prime-sidebar-hover hover:text-white"
              >
                Sair
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-40 shrink-0 border-b border-prime-border bg-prime-card/95 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
              <div className="flex items-center gap-3 lg:hidden">
                <BrandLogo compact subtitle="OPERAÇÃO" variant="light" />
              </div>
              <nav className="flex flex-1 flex-wrap gap-1 overflow-x-auto lg:hidden" aria-label="Menu móvel">
                {visibleNav.slice(0, 5).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-md px-2 py-1 text-xs ${
                      isActivePath(pathname, item.href)
                        ? "bg-prime-gold/15 font-medium text-prime-gold"
                        : "text-prime-muted"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-3">
                {isAdmin || isFinanceiro ? <ReceivablesAlertPill /> : null}
                {showFullNav ? <PendingRequestsPill tenantId={session?.tenantId ?? null} /> : null}
                {showFullNav ? <NewTripRequestAlert tenantId={session?.tenantId ?? null} /> : null}
                {isAdmin || isFinanceiro || isOperador ? (
                  <NotificationsBell
                    tenantId={session?.tenantId ?? null}
                    role={isAdmin ? "admin" : isFinanceiro ? "financeiro" : "operador"}
                  />
                ) : null}
                <span className="rounded-full border border-prime-border bg-prime-bg px-3 py-1 text-xs text-prime-text">
                  {session ? papelUsuarioPt(session.role) : "…"}
                </span>
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-prime-gold to-prime-gold-hover text-sm font-bold text-prime-text"
                  aria-hidden
                >
                  AM
                </span>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 lg:px-8 lg:py-8">
            {session && !showFullNav && !isFinanceiro ? (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
                <span>
                  Você está conectado com uma conta de <b>{session.role === "cliente" ? "cliente" : session.role}</b>, não com a conta da central.
                  Saia e entre com o e-mail da Prime para usar o painel.
                </span>
                <form action={logoutAction}>
                  <button type="submit" className="rounded-lg bg-[#111] px-3 py-1.5 text-xs font-semibold text-[#fff]">
                    Sair e entrar de novo
                  </button>
                </form>
              </div>
            ) : null}
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
