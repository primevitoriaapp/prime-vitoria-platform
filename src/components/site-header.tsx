"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { papelUsuarioPt } from "@/lib/i18n/pt-br";

type SessionPayload = {
  userId: string;
  role: string;
  tenantId?: string | null;
};

const BACKOFFICE_LINKS = [
  { href: "/dashboard", label: "Painel" },
  { href: "/agenda", label: "Agenda" },
  { href: "/clients", label: "Clientes" },
  { href: "/drivers", label: "Motoristas" },
  { href: "/vehicles", label: "Veículos" },
  { href: "/dispatch", label: "Despacho" }
] as const;

function navLinkStyle(active: boolean): CSSProperties {
  return {
    fontWeight: active ? 600 : 400,
    color: active ? "#b45309" : "#334155",
    textDecoration: "none"
  };
}

export function SiteHeader() {
  const pathname = usePathname();
  const [session, setSession] = useState<SessionPayload | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/session", { credentials: "include" })
      .then((r) => r.json())
      .then((body) => {
        if (cancelled) return;
        if (body?.success && body?.data?.role && body.data.role !== "guest") {
          setSession({
            userId: body.data.userId,
            role: body.data.role,
            tenantId: body.data.tenantId ?? null
          });
        } else {
          setSession(null);
        }
      })
      .catch(() => {
        if (!cancelled) setSession(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const role = session?.role;
  const isOperadorBackoffice = role === "admin" || role === "operador";
  const isAdmin = role === "admin";

  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 20px",
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        flexWrap: "wrap",
        boxShadow: "0 1px 2px rgba(15, 23, 42, 0.06)"
      }}
    >
      <Link href="/" style={{ fontWeight: 600, textDecoration: "none", color: "#0f172a" }}>
        Prime Vitória
      </Link>
      <nav style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, flexWrap: "wrap" }}>
        {isOperadorBackoffice ? (
          <>
            {BACKOFFICE_LINKS.map((item) => (
              <Link key={item.href} href={item.href} style={navLinkStyle(pathname.startsWith(item.href))}>
                {item.label}
              </Link>
            ))}
            <Link href="/users" style={navLinkStyle(pathname.startsWith("/users"))}>
              Utilizadores
            </Link>
          </>
        ) : null}
        {isAdmin ? (
          <>
            <Link href="/finance" style={navLinkStyle(pathname.startsWith("/finance"))}>
              Financeiro
            </Link>
            <Link href="/driver" style={navLinkStyle(pathname.startsWith("/driver"))}>
              App motorista
            </Link>
            <Link href="/client" style={navLinkStyle(pathname.startsWith("/client"))}>
              Portal cliente
            </Link>
          </>
        ) : null}
        {role === "financeiro" ? (
          <>
            <Link href="/finance" style={navLinkStyle(pathname.startsWith("/finance"))}>
              Financeiro
            </Link>
            <Link href="/audit" style={navLinkStyle(pathname.startsWith("/audit"))}>
              Auditoria
            </Link>
          </>
        ) : null}
        {role === "motorista" ? (
          <Link href="/driver" style={navLinkStyle(pathname.startsWith("/driver"))}>
            Motorista
          </Link>
        ) : null}
        {role === "cliente" ? (
          <Link href="/client" style={navLinkStyle(pathname.startsWith("/client"))}>
            Cliente
          </Link>
        ) : null}
        {!session && (
          <>
            <Link href="/driver">Motorista</Link>
            <Link href="/client">Cliente</Link>
          </>
        )}
        {session === undefined ? (
          <span style={{ color: "#94a3b8" }}>…</span>
        ) : session ? (
          <form action={logoutAction} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {session.tenantId ? (
              <span style={{ fontSize: 12, color: "#64748b" }} title="Organização (tenant)">
                Org: {session.tenantId.slice(0, 8)}…
              </span>
            ) : null}
            <button type="submit" style={{ fontSize: 14, cursor: "pointer" }}>
              Sair ({papelUsuarioPt(session.role)})
            </button>
          </form>
        ) : (
          <Link href="/login">Entrar</Link>
        )}
      </nav>
    </header>
  );
}
