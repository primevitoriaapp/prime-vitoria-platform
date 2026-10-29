import type { Metadata } from "next";
import { PublicRequestForm } from "@/components/public-request-form";

export const metadata: Metadata = {
  title: "Pedir orçamento · Prime Vitória Transporte Executivo",
  description: "Transfer, aeroporto, casamento, turismo e eventos em Vitória/ES com carros executivos, SUVs, vans e ônibus."
};

/** Página pública para pessoa física (ou empresa nova) pedir orçamento. */
export default function PedirPage() {
  return (
    <div className="min-h-dvh bg-[#F4F1EA]">
      <header className="bg-[#111] px-5 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))] text-center">
        <p className="text-xl font-bold tracking-[0.08em] text-[#fff]">
          PRIME <span className="text-[#C9A84C]">VITÓRIA</span>
        </p>
        <p className="text-[10px] tracking-[0.28em] text-[#C9A84C]">TRANSPORTE EXECUTIVO</p>
        <h1 className="mx-auto mt-6 max-w-md text-2xl font-semibold leading-tight" style={{ color: "#fff" }}>Peça seu orçamento</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#fff]/70">Transfer, aeroporto, casamento, turismo e eventos. Respondemos rapidinho pelo WhatsApp.</p>
      </header>
      <div className="h-1 bg-[#C9A84C]" />
      <main className="mx-auto max-w-xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5">
        <PublicRequestForm />
        <p className="mt-6 text-center text-[11px] text-[#9A9A9A]">
          Ao enviar, você concorda com a{" "}
          <a href="/privacidade" className="underline">
            política de privacidade
          </a>
          .
        </p>
      </main>
    </div>
  );
}
