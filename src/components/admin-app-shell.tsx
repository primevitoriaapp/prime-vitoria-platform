"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { BrandLogo } from "@/components/brand-logo";
import { NewTripRequestAlert } from "@/components/new-trip-request-alert";
import { ReceivablesAlertPill } from "@/components/receivables-alert-pill";
import { PayablesAlertPill } from "@/components/payables-alert-pill";
import { CompanySwitcher } from "@/components/company-switcher";
import { CompanyProvider } from "@/lib/company/company-context";
import { PendingRequestsPill } from "@/components/pending-requests-pill";
import { NotificationsBell } from "@/components/notifications-bell";
import { papelUsuarioPt } from "@/lib/i18n/pt-br";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "▣" },
  { href: "/ao-vivo", label: "Ao vivo", icon: "◍" },
  { href: "/orcamentos", label: "Orçamentos", icon: "✎" },
  { href: "/dispatch", label: "Despacho", icon: "◎" },
  { href: "/agenda", label: "Agenda", icon: "◷" },
  { href: "/whatsapp", label: "WhatsApp", icon: "✆" },
  { href: "/drivers", label: "Motoristas", icon: "◉" },
  { href: "/parceiros", label: "Parceiros", icon: "◐" },
  { href: "/categorias", label: "Categorias", icon: "◇" },
  { href: "/vehicles", label: "Veículos", icon: "▤" },
  { href: "/clients", label: "Clientes", icon: "▦" },
  { href: "/clients/relatorio", label: "Relatório por cliente", icon: "▧" },
  { href: "/painel-financeiro", label: "Painel financeiro", icon: "▤" },
  { href: "/finance", label: "Financeiro", icon: "◈" },
  { href: "/contas-a-pagar", label: "Contas a pagar", icon: "◆" },
  { href: "/repasses", label: "Repasses a parceiros", icon: "⇉" },
  { href: "/conciliacao", label: "Conciliação bancária", icon: "⇄" }
] as const;

const ADMIN_EXTRA = [
  { href: "/configuracoes", label: "Configurações" },
  { href: "/integracoes", label: "Integrações" },
  { href: "/importar", label: "Importar planilha" },
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
  // Menu completo no celular/tablet (gaveta lateral).
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);

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
      ? NAV.filter((n) => ["/painel-financeiro", "/finance", "/dashboard", "/clients/relatorio", "/contas-a-pagar", "/repasses", "/conciliacao"].includes(n.href))
      : NAV;

  const sidebarBody = (
    <>
          <div className="border-b border-white/10 px-4 py-5">
            <Link href="/dashboard" aria-label="Voltar ao início">
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
    </>
  );

  return (
    <CompanyProvider>
    <div className="admin-theme flex h-dvh flex-col overflow-hidden bg-prime-bg text-prime-text">
      <div className="flex min-h-0 flex-1">
        <aside className="prime-sidebar hidden h-full w-60 shrink-0 flex-col overflow-hidden border-r border-white/10 bg-prime-sidebar md:flex print:hidden">
          {sidebarBody}
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="z-40 shrink-0 border-b border-prime-border bg-prime-card/95 backdrop-blur print:hidden">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3 lg:px-8">
              <div className="flex min-w-0 items-center gap-2 md:hidden">
                <button
                  type="button"
                  onClick={() => setMenuOpen(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-prime-border"
                  aria-label="Abrir menu"
                >
                  <span className="block h-0.5 w-5 bg-prime-text shadow-[0_6px_0_currentColor,0_-6px_0_currentColor]" />
                </button>
                <Link href="/dashboard" className="min-w-0" aria-label="Voltar ao início">
                  <BrandLogo compact subtitle="OPERAÇÃO" variant="light" />
                </Link>
              </div>
              {/* No celular, empresa e alertas descem para uma segunda linha (renderizados uma vez só). */}
              <div className="order-3 flex w-full flex-wrap items-center gap-2 empty:hidden md:order-none md:w-auto md:flex-1 md:justify-end sm:gap-3">
                {isAdmin || isFinanceiro ? <CompanySwitcher /> : null}
                {isAdmin || isFinanceiro ? <ReceivablesAlertPill /> : null}
                {isAdmin || isFinanceiro ? <PayablesAlertPill /> : null}
                {showFullNav ? <PendingRequestsPill tenantId={session?.tenantId ?? null} /> : null}
                {showFullNav ? <NewTripRequestAlert tenantId={session?.tenantId ?? null} /> : null}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-2 sm:gap-3">
                {isAdmin || isFinanceiro || isOperador ? (
                  <NotificationsBell
                    tenantId={session?.tenantId ?? null}
                    role={isAdmin ? "admin" : isFinanceiro ? "financeiro" : "operador"}
                  />
                ) : null}
                <span className="hidden rounded-full border border-prime-border bg-prime-bg px-3 py-1 text-xs text-prime-text lg:inline">
                  {session ? papelUsuarioPt(session.role) : "…"}
                </span>
                <span
                  className="hidden h-9 w-9 items-center sm:flex justify-center rounded-full bg-gradient-to-br from-prime-gold to-prime-gold-hover text-sm font-bold text-prime-text"
                  aria-hidden
                >
                  AM
                </span>
              </div>
            </div>
          </header>

          <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-6 lg:px-8 lg:py-8 print:overflow-visible">
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
      {menuOpen ? (
        <div className="fixed inset-0 z-[100] md:hidden print:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />
          <aside className="prime-sidebar absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col overflow-hidden bg-prime-sidebar pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl">
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-[#fff]"
              aria-label="Fechar menu"
            >
              ×
            </button>
            {sidebarBody}
          </aside>
        </div>
      ) : null}
    </div>
    </CompanyProvider>
  );
}

function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/clients" && pathname.startsWith("/clients/relatorio")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
