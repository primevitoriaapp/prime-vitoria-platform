"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { BILLING_ISSUER_OPTIONS, type BillingIssuer } from "@/lib/clients/billing-terms-calc";

export type CompanyScope = "todas" | BillingIssuer;

const KEY = "prime_empresa";

export const COMPANY_SCOPES: { id: CompanyScope; label: string }[] = [
  { id: "todas", label: "Todas as empresas" },
  ...BILLING_ISSUER_OPTIONS.map((o) => ({ id: o.id as CompanyScope, label: o.label }))
];

const Ctx = createContext<{ company: CompanyScope; setCompany: (c: CompanyScope) => void }>({
  company: "todas",
  setCompany: () => undefined
});

function readCookie(): CompanyScope {
  if (typeof document === "undefined") return "todas";
  const m = document.cookie.match(/(?:^|; )prime_empresa=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : "todas";
  return COMPANY_SCOPES.some((c) => c.id === v) ? (v as CompanyScope) : "todas";
}

/** Empresa escolhida no topo do painel (vale para o financeiro). Fica guardada no navegador. */
export function CompanyProvider({ children }: { children: ReactNode }) {
  const [company, setState] = useState<CompanyScope>("todas");
  useEffect(() => setState(readCookie()), []);
  const setCompany = useCallback((c: CompanyScope) => {
    setState(c);
    document.cookie = `${KEY}=${encodeURIComponent(c)}; path=/; max-age=31536000; samesite=lax`;
  }, []);
  return <Ctx.Provider value={{ company, setCompany }}>{children}</Ctx.Provider>;
}

export function useCompany() {
  return useContext(Ctx);
}

/** Um registro com empresa `issuer` entra no filtro atual? Sem empresa só aparece em "Todas". */
export function inCompany(scope: CompanyScope, issuer: string | null | undefined): boolean {
  return scope === "todas" || issuer === scope;
}

export function companyLabel(id: string | null | undefined): string {
  return COMPANY_SCOPES.find((c) => c.id === id)?.label ?? "Sem empresa";
}
