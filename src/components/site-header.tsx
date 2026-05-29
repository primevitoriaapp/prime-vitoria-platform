"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { logoutAction } from "@/app/login/actions";
import { papelUsuarioPt } from "@/lib/i18n/pt-br";

type SessionPayload = {
  userId: string;
  role: string;
  tenantId?: string | null;
};

export function SiteHeader() {
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
  const isBackoffice = role === "admin" || role === "operador" || role === "financeiro";

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
        padding: "12px 20px",
        background: "#fff",
        borderBottom: "1px solid #e2e8f0",
        flexWrap: "wrap"
      }}
    >
      <Link href="/" style={{ fontWeight: 600, textDecoration: "none", color: "#0f172a" }}>
        Prime Vitória
      </Link>
      <nav style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14, flexWrap: "wrap" }}>
        {isBackoffice ? (
          <>
            <Link href="/dashboard">Painel</Link>
            <Link href="/agenda">Agenda</Link>
            <Link href="/clients">Clientes</Link>
            <Link href="/drivers">Motoristas</Link>
            <Link href="/vehicles">Veículos</Link>
            {(role === "admin" || role === "operador") && <Link href="/users">Utilizadores</Link>}
            <Link href="/audit">Auditoria</Link>
            <Link href="/dispatch">Despacho</Link>
          </>
        ) : null}
        {role === "motorista" ? <Link href="/driver">Motorista</Link> : null}
        {role === "cliente" ? <Link href="/client">Cliente</Link> : null}
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
