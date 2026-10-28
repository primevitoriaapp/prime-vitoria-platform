import { PrimeLogoMark } from "@/components/prime-logo-mark";

/** Moldura das telas de senha (esqueci / criar senha nova). */
export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-prime-bg px-5 py-10 sm:justify-center">
      <div className="mb-6 flex items-center gap-3">
        <PrimeLogoMark size={40} />
        <div className="leading-tight">
          <p className="font-semibold text-prime-text">Prime Vitória</p>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-prime-gold">Transporte executivo</p>
        </div>
      </div>
      <section className="w-full max-w-sm rounded-2xl border border-prime-border bg-white p-6 shadow-prime-card">
        <h1 className="font-prime-display text-2xl text-prime-text">{title}</h1>
        <div className="mt-4 grid gap-4 text-sm text-prime-text">{children}</div>
      </section>
    </div>
  );
}

export const AUTH_FIELD =
  "w-full rounded-lg border border-prime-input-border bg-white px-3.5 py-3 text-base text-prime-text outline-none focus:border-prime-gold focus:ring-2 focus:ring-prime-gold/25 disabled:opacity-60";

export const AUTH_BUTTON =
  "w-full rounded-lg bg-[#111] px-4 py-3 text-base font-semibold text-[#fff] hover:bg-black disabled:opacity-60";
