"use client";

import { COMPANY_SCOPES, useCompany, type CompanyScope } from "@/lib/company/company-context";

/** Seletor "Empresa" no topo do painel. */
export function CompanySwitcher() {
  const { company, setCompany } = useCompany();
  return (
    <label className="hidden items-center gap-2 text-xs sm:flex" title="Filtra o financeiro pela empresa">
      <span className="font-semibold uppercase tracking-wide text-prime-muted">Empresa</span>
      <select
        value={company}
        onChange={(e) => setCompany(e.target.value as CompanyScope)}
        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
          company === "todas" ? "border-prime-border bg-white" : "border-prime-gold bg-[#111] text-prime-gold"
        }`}
      >
        {COMPANY_SCOPES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  );
}
