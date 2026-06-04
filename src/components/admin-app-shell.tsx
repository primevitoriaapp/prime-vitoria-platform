"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { BrandLogo } from "@/components/brand-logo";
import { papelUsuarioPt } from "@/lib/i18n/pt-br";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▣" },
  { href: "/dispatch", label: "Despacho", icon: "◎" },
  { href: "/agenda", label: "Agenda", icon: "◷" },
  { href: "/drivers", label: "Motoristas", icon: "◉" },
  { href: "/vehicles", label: "Veículos", icon: "▤" },
  { href: "/clients", label: "Clientes", icon: "▦" },
  { href: "/finance", label: "Financeiro", icon: "◈" }
] as const;

const ADMIN_EXTRA = [
  { href: "/users", label: "Utilizadores" },
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
  const showFullNav = session?.role === "admin" || session?.role === "operador";

  const visibleNav = showFullNav
    ? NAV
    : isFinanceiro
      ? NAV.filter((n) => n.href === "/finance" || n.href === "/dashboard")
      : NAV;

  return (
    <div className="admin-theme min-h-screen bg-prime-bg text-prime-text">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-prime-input-border bg-prime-sidebar lg:flex">
          <div className="border-b border-prime-input-border px-4 py-5">
            <Link href="/dashboard">
              <BrandLogo />
            </Link>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Operação">
            <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-prime-muted">
              Operação
            </p>
            {visibleNav.map((item) => (
              <Link key={item.href} href={item.href} className={navClass(pathname.startsWith(item.href))}>
                <span className="w-5 text-center text-xs opacity-70" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="space-y-1 border-t border-prime-input-border px-3 py-4">
            {isAdmin
              ? ADMIN_EXTRA.map((item) => (
                  <Link key={item.href} href={item.href} className={navClass(pathname.startsWith(item.href))}>
                    {item.label}
                  </Link>
                ))
              : null}
            <form action={logoutAction} className="px-1 pt-2">
              <button
                type="submit"
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-prime-muted hover:bg-prime-sidebar-hover hover:text-prime-text"
              >
                Sair
              </button>
            </form>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-prime-input-border bg-prime-bg/95 backdrop-blur">
            <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-8">
              <div className="flex items-center gap-3 lg:hidden">
                <BrandLogo compact subtitle="OPERAÇÃO" />
              </div>
              <nav className="flex flex-1 flex-wrap gap-1 overflow-x-auto lg:hidden" aria-label="Menu móvel">
                {visibleNav.slice(0, 5).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`shrink-0 rounded-md px-2 py-1 text-xs ${
                      pathname.startsWith(item.href)
                        ? "bg-prime-gold/15 text-prime-gold"
                        : "text-prime-muted"
                    }`}
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
              <div className="flex items-center gap-3">
                {session?.tenantId ? (
                  <span className="hidden text-xs text-prime-muted sm:inline" title="Tenant">
                    {session.tenantId.slice(0, 8)}…
                  </span>
                ) : null}
                <span className="rounded-full border border-prime-input-border bg-prime-card px-3 py-1 text-xs text-prime-text">
                  {session ? papelUsuarioPt(session.role) : "…"}
                </span>
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-prime-gold to-prime-gold-hover text-sm font-bold text-prime-bg"
                  aria-hidden
                >
                  AM
                </span>
              </div>
            </div>
          </header>

          <div className="flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</div>
        </div>
      </div>
    </div>
  );
}
