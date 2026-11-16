"use client";

import { useEffect, useState } from "react";
import { LeadForm } from "@/components/site/lead-form";

/** Botão "Gostaria de fazer parte?" que abre o formulário de cadastro. Abre sozinho se a pessoa veio pelo link #cadastro. */
export function LeadFormReveal({ kind, label }: { kind: "motorista" | "empresa"; label: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => window.location.hash === "#cadastro" && setOpen(true);
    check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
  if (open) return <LeadForm kind={kind} />;
  return (
    <div className="flex items-center justify-center rounded-[28px] border border-white/15 bg-white/5 p-8 sm:p-12">
      <button type="button" onClick={() => setOpen(true)} className="w-full rounded-full bg-[#D9BC6A] px-8 py-5 text-lg font-semibold text-[#111] shadow-lg sm:w-auto">
        {label}
      </button>
    </div>
  );
}
