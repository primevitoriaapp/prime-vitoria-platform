import type { ReactNode } from "react";
import { SITE } from "@/components/site/site-data";

/** Peças comuns das páginas de captação (motorista parceiro e empresas). Mesmo visual do site. */

export function LandingNav({ cta, ctaHref }: { cta: string; ctaHref: string }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-[#ECE7DB] bg-white/90 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
        <a href="/" className="flex items-center gap-3" aria-label="Prime Vitória — site">
          <img src={SITE.img.logo} alt="" width={40} height={40} className="h-10 w-10 rounded-xl object-cover" />
          <span className="leading-tight">
            <span className="block whitespace-nowrap font-prime-serif text-[17px] font-semibold text-[#111]">Prime Vitória</span>
            <span className="hidden text-[9px] font-semibold uppercase tracking-[0.28em] text-[#A8873A] sm:block">Transporte executivo</span>
          </span>
        </a>
        <a href={ctaHref} className="whitespace-nowrap rounded-full bg-[#111] px-4 py-2.5 text-sm font-semibold text-[#D9BC6A] sm:px-5">
          {cta}
        </a>
      </div>
    </header>
  );
}

export function Kicker({ children, light }: { children: ReactNode; light?: boolean }) {
  return <p className={`text-[12px] font-semibold uppercase tracking-[0.28em] ${light ? "text-[#D9BC6A]" : "text-[#A8873A]"}`}>{children}</p>;
}

export function H2({ children, light }: { children: ReactNode; light?: boolean }) {
  // A cor vai no style: o tema geral pinta todo título de preto e venceria a classe.
  return (
    <h2 className="mt-3 font-prime-serif text-[30px] leading-[1.15] sm:text-[40px]" style={{ color: light ? "#fff" : "#111" }}>
      {children}
    </h2>
  );
}

export function Hero({ img, kicker, title, sub, cta, ctaHref, note }: { img: string; kicker: string; title: ReactNode; sub: string; cta: string; ctaHref: string; note?: string }) {
  return (
    <section className="relative flex min-h-[88svh] items-end overflow-hidden pt-24 sm:items-center">
      <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-black/40 sm:bg-gradient-to-r sm:from-black/90 sm:via-black/65 sm:to-black/15" aria-hidden />
      <div className="relative mx-auto w-full max-w-6xl px-5 pb-14 sm:pb-0">
        <div className="max-w-2xl">
          <Kicker light>{kicker}</Kicker>
          <h1 className="mt-4 font-prime-serif text-[40px] leading-[1.05] sm:text-[64px]" style={{ color: "#fff", textShadow: "0 2px 18px rgba(0,0,0,0.45)" }}>
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">{sub}</p>
          <a href={ctaHref} className="mt-8 inline-block w-full rounded-full bg-[#D9BC6A] px-8 py-4 text-center text-base font-semibold text-[#111] shadow-lg sm:w-auto">
            {cta}
          </a>
          {note ? <p className="mt-3 text-sm text-white/70">{note}</p> : null}
        </div>
      </div>
    </section>
  );
}

export function Cards({ items }: { items: { icon: string; t: string; d: string }[] }) {
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((s) => (
        <article key={s.t} className="rounded-[26px] border border-[#ECE7DB] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F7F2E6]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A8873A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={s.icon} />
            </svg>
          </span>
          <h3 className="text-lg font-semibold" style={{ color: "#111" }}>{s.t}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6F6A60]">{s.d}</p>
        </article>
      ))}
    </div>
  );
}

export function Steps({ items }: { items: { t: string; d: string }[] }) {
  return (
    <ol className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((p, i) => (
        <li key={p.t}>
          <span className="mb-3 block font-prime-serif text-5xl text-[#D9BC6A]">{i + 1}</span>
          <h3 className="text-lg font-semibold" style={{ color: "#111" }}>{p.t}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-[#6F6A60]">{p.d}</p>
        </li>
      ))}
    </ol>
  );
}

export function CheckList({ items }: { items: string[] }) {
  return (
    <ul className="mt-8 divide-y divide-[#ECE7DB] rounded-[26px] border border-[#ECE7DB] bg-white">
      {items.map((x) => (
        <li key={x} className="flex items-start gap-3 px-5 py-4 text-[15px] text-[#111]">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#111] text-[12px] text-[#D9BC6A]">✓</span>
          {x}
        </li>
      ))}
    </ul>
  );
}

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <div className="mt-8 space-y-3">
      {items.map((f) => (
        <details key={f.q} className="group rounded-[22px] border border-[#ECE7DB] bg-white px-5 py-4">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-semibold text-[#111]">
            {f.q}
            <span className="text-xl text-[#A8873A] transition group-open:rotate-45">+</span>
          </summary>
          <p className="mt-3 text-[15px] leading-relaxed text-[#6F6A60]">{f.a}</p>
        </details>
      ))}
    </div>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-[#111] px-5 py-10 text-sm text-white/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-prime-serif text-lg text-white">Prime Vitória</p>
          <p className="mt-1">{SITE.address}</p>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <a href="/" className="hover:text-white">Site</a>
          <a href={SITE.whatsapp} target="_blank" rel="noopener noreferrer" className="hover:text-white">WhatsApp</a>
          <a href={`mailto:${SITE.email}`} className="hover:text-white">{SITE.email}</a>
          <a href="/privacidade" className="hover:text-white">Privacidade</a>
        </div>
      </div>
    </footer>
  );
}

export function Fleet({ items }: { items: { img: string; t: string; tag?: string; d: string }[] }) {
  return (
    <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((f) => (
        <article key={f.t} className="overflow-hidden rounded-[26px] border border-[#ECE7DB] bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <img src={f.img} alt={f.t} loading="lazy" className="aspect-[4/3] w-full object-cover object-[center_60%]" />
          <div className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold" style={{ color: "#111" }}>
                {f.t}
              </h3>
              {f.tag ? <span className="shrink-0 rounded-full bg-[#111] px-2.5 py-1 text-[11px] font-semibold text-[#D9BC6A]">{f.tag}</span> : null}
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-[#6F6A60]">{f.d}</p>
          </div>
        </article>
      ))}
    </div>
  );
}
