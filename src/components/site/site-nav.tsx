"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { SITE } from "@/components/site/site-data";
import { SITE_LANGS, SITE_TEXT, type SiteLang } from "@/components/site/site-i18n";

/** Topo do site: transparente sobre a foto da ponte, branco ao rolar. */
export function SiteNav({ lang }: { lang: SiteLang }) {
  const T = SITE_TEXT[lang].nav;
  const LINKS = [
    ["#servicos", T.servicos],
    ["#empresas", T.empresas],
    ["#frota", T.frota],
    ["#contato", T.contato]
  ] as const;
  const agendar = (lang === "pt" ? SITE.links.agendar : `${SITE.links.agendar}?lang=${lang}`) as Route;
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  const dark = solid || open;
  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 pt-[env(safe-area-inset-top)] transition-colors duration-300 ${dark ? "border-b border-[#ECE7DB] bg-white/90 backdrop-blur" : "bg-transparent"}`}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3.5">
        <a href="#topo" className="flex items-center gap-3" aria-label="Prime Vitória — início">
          <img src={SITE.img.logo} alt="" width={40} height={40} className="h-10 w-10 rounded-xl object-cover" />
          <span className="leading-tight">
            <span className="block whitespace-nowrap font-prime-display text-[17px] font-semibold" style={{ color: dark ? "#111" : "#fff" }}>
              Prime Vitória
            </span>
            <span className="hidden whitespace-nowrap text-[9px] font-semibold uppercase tracking-[0.28em] sm:block" style={{ color: "#C9A84C" }}>
              Transporte executivo
            </span>
          </span>
        </a>
        <nav className="hidden items-center gap-7 md:flex" aria-label="Seções">
          {LINKS.map(([h, l]) => (
            <a key={h} href={h} className="text-sm font-medium transition hover:opacity-70" style={{ color: dark ? "#111" : "#fff" }}>
              {l}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-2 md:flex">
          <Langs lang={lang} dark={dark} />
          <Link
            href={SITE.links.empresa as Route}
            className={`rounded-full px-4 py-2 text-sm font-medium ring-1 ${dark ? "text-[#111] ring-[#E2DCCD]" : "text-[#fff] ring-white/40"}`}
          >
            {T.area}
          </Link>
          <Link href={agendar} className="rounded-full bg-[#111] px-4 py-2 text-sm font-semibold text-[#D9BC6A]">
            {T.agendar}
          </Link>
        </div>
        <div className="flex items-center gap-2 md:hidden">
        <Langs lang={lang} dark={dark} />
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`flex h-10 w-10 items-center justify-center rounded-full md:hidden ${dark ? "bg-[#F4F1EA]" : "bg-white/15 backdrop-blur"}`}
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-expanded={open}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dark ? "#111" : "#fff"} strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
        </div>
      </div>
      {open ? (
        <div className="border-t border-[#ECE7DB] bg-white px-5 pb-6 pt-2 md:hidden">
          {LINKS.map(([h, l]) => (
            <a key={h} href={h} onClick={() => setOpen(false)} className="block border-b border-[#F2EEE6] py-3.5 text-base text-[#111]">
              {l}
            </a>
          ))}
          <div className="mt-5 grid gap-2">
            <Link href={agendar} className="rounded-2xl bg-[#111] py-3.5 text-center font-semibold text-[#D9BC6A]">
              {T.agendar}
            </Link>
            <Link href={SITE.links.empresa as Route} className="rounded-2xl py-3.5 text-center font-medium text-[#111] ring-1 ring-[#E2DCCD]">
              {T.area}
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function Langs({ lang, dark }: { lang: SiteLang; dark: boolean }) {
  return (
    <div className={`flex rounded-full p-0.5 text-[11px] font-semibold ${dark ? "bg-[#F4F1EA]" : "bg-white/15 backdrop-blur"}`}>
      {SITE_LANGS.map((l) => (
        <a
          key={l.id}
          href={l.path}
          hrefLang={l.id}
          aria-current={l.id === lang ? "true" : undefined}
          className={`rounded-full px-2 py-1 ${l.id === lang ? "bg-[#111] text-[#D9BC6A]" : ""}`}
          style={l.id === lang ? undefined : { color: dark ? "#6F6A60" : "rgba(255,255,255,0.85)" }}
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}
