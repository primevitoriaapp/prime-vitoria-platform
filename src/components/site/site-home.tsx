import type { Route } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/site/site-nav";
import { SITE } from "@/components/site/site-data";
import { SITE_TEXT, type SiteLang } from "@/components/site/site-i18n";
import { loadGoogleReviews } from "@/lib/integrations/google-reviews";
import { GoogleReviewsTicker } from "@/components/site/google-reviews-ticker";
import { BrazilMap } from "@/components/site/brazil-map";

const SERVICE_ICONS = [
  "M2 16l20-6-3-2-6 2-6-6-2 1 4 6-5 2-2-1-1 1z",
  "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  "M4 19l5-14 6 9 2-4 3 9",
  "M4 6h16v14H4zM4 10h16M9 3v5M15 3v5",
  "M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z",
  "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  "M3 7h14l4 5v5h-2M3 7v10h2M9 17h6M3 12h18",
  "M5 4h14a2 2 0 0 1 2 2v11H3V6a2 2 0 0 1 2-2zM3 11h18M7 17v2M17 17v2M7 14h.01M17 14h.01"
];
const FLEET_IMG = [SITE.img.sedan, SITE.img.suv, SITE.img.van];
const SOCIAL = [
  { id: "instagram", label: "Instagram", d: "M7 3h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.5 6.5h.01" },
  { id: "facebook", label: "Facebook", d: "M15 3h-2a4 4 0 0 0-4 4v3H7v4h2v7h4v-7h3l1-4h-4V7a1 1 0 0 1 1-1h2z" },
  { id: "linkedin", label: "LinkedIn", d: "M4 9h4v12H4zM6 3a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 9h4v2c.6-1.2 2-2.2 4-2.2 3 0 4 2 4 5.2V21h-4v-6c0-1.5-.5-2.5-2-2.5S14 13.6 14 15v6h-4z" },
  { id: "tiktok", label: "TikTok", d: "M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 4.5" },
  { id: "youtube", label: "YouTube", d: "M3 8a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3zM10 9l5 3-5 3z" }
] as const;


function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#A8873A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#A8873A]">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-3 font-prime-display text-[30px] leading-[1.15] sm:text-[40px]" style={{ color: "#111" }}>
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-lg font-semibold" style={{ color: "#111", fontFamily: "inherit" }}>
      {children}
    </h3>
  );
}

/** Site institucional da Prime Vitória (PT, EN e ES). Nenhum preço aparece aqui. */
export async function SiteHome({ lang }: { lang: SiteLang }) {
  const T = SITE_TEXT[lang];
  const google = await loadGoogleReviews(lang);
  const parceiroHref = SITE.parceiroForm || `https://wa.me/5527998063956?text=${encodeURIComponent(T.parceiro.waMsg)}`;
  const wa = `https://wa.me/5527998063956?text=${encodeURIComponent(T.whatsappMsg)}`;
  const agendar = (lang === "pt" ? SITE.links.agendar : `${SITE.links.agendar}?lang=${lang}`) as Route;
  const empresa = SITE.links.empresa as Route;
  const empresaCadastro = SITE.empresaForm || `https://wa.me/5527998063956?text=${encodeURIComponent(T.empresas.waMsg)}`;

  return (
    <div id="topo" lang={lang === "pt" ? "pt-BR" : lang} className="min-h-screen bg-[#F7F5F0] text-[#111]">
      <SiteNav lang={lang} />

      {/* Foto da ponte, mantida como marca do site */}
      <section className="relative flex min-h-[100svh] items-center overflow-hidden">
        <picture>
          <source media="(max-width: 767px)" srcSet={SITE.img.heroMobile} />
          <img src={SITE.img.hero} alt={T.hero.alt} className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
        </picture>
        <div className="absolute inset-0 bg-black/55" aria-hidden />
        <div className="relative mx-auto w-full max-w-4xl px-5 pb-16 pt-28 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em]" style={{ color: "#D9BC6A" }}>
            {T.hero.kicker}
          </p>
          <h1 className="mx-auto mt-4 max-w-3xl font-prime-display text-[42px] leading-[1.05] sm:text-[72px]" style={{ color: "#fff" }}>
            {T.hero.title}
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed sm:text-lg" style={{ color: "rgba(255,255,255,0.82)" }}>
            {T.hero.sub}
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href={agendar} className="rounded-full bg-[#fff] px-7 py-4 text-center text-base font-semibold text-[#111] shadow-lg">
              {T.nav.agendar}
            </Link>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-full px-7 py-4 text-center text-base font-medium text-[#fff] ring-1 ring-white/50 backdrop-blur-sm">
              {T.hero.whatsapp}
            </a>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm" style={{ color: "rgba(255,255,255,0.75)" }}>
            {T.hero.badges.map((b) => (
              <span key={b}>✦ {b}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Logos de clientes (aparece quando houver logos autorizados) */}
      {SITE.clientes.length > 0 ? (
        <section className="border-b border-[#ECE7DB] bg-white py-10">
          <p className="text-center text-xs uppercase tracking-[0.24em] text-[#8A8A8A]">{T.clientes}</p>
          <div className="mx-auto mt-6 flex max-w-5xl flex-wrap items-center justify-center gap-x-10 gap-y-6 px-5">
            {SITE.clientes.map((c) => (
              <img key={c.name} src={c.src} alt={c.name} className="h-9 w-auto object-contain opacity-70 grayscale" loading="lazy" />
            ))}
          </div>
        </section>
      ) : null}

      {/* Serviços */}
      <section id="servicos" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:py-28">
        <Kicker>{T.servicos.kicker}</Kicker>
        <H2>{T.servicos.title}</H2>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {T.servicos.items.map((s, i) => (
            <article key={s.t} className="rounded-[26px] border border-[#ECE7DB] bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
              <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F7F2E6]">
                <Icon d={SERVICE_ICONS[i] ?? SERVICE_ICONS[0]} />
              </span>
              <H3>{s.t}</H3>
              <p className="mt-1.5 text-sm leading-relaxed text-[#6F6A60]">{s.d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Kicker>{T.passos.kicker}</Kicker>
          <H2>{T.passos.title}</H2>
          <ol className="mt-12 grid gap-10 sm:grid-cols-3">
            {T.passos.items.map((p, i) => (
              <li key={p.t}>
                <span className="mb-3 block font-prime-display text-5xl text-[#D9BC6A]">{i + 1}</span>
                <H3>{p.t}</H3>
                <p className="mt-1.5 text-sm leading-relaxed text-[#6F6A60]">{p.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Empresas */}
      <section id="empresas" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-20 sm:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <Kicker>{T.empresas.kicker}</Kicker>
            <H2>{T.empresas.title}</H2>
            <p className="mt-5 text-base leading-relaxed text-[#6F6A60]">{T.empresas.sub}</p>
            <ul className="mt-6 space-y-3 text-[15px]">
              {T.empresas.bullets.map((x) => (
                <li key={x} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#111] text-[11px] text-[#D9BC6A]">✓</span>
                  {x}
                </li>
              ))}
            </ul>
            <div className="mt-8">
              <a href={empresaCadastro} target="_blank" rel="noopener noreferrer" className="inline-block w-full rounded-full bg-[#111] px-7 py-4 text-center font-semibold text-[#D9BC6A] sm:w-auto">
                {T.empresas.cadastrar}
              </a>
            </div>
          </div>
          {/* Miniatura do portal (ilustrativa) */}
          <div className="mx-auto w-full max-w-sm rounded-[36px] border border-[#ECE7DB] bg-[#F4F2EE] p-4 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.35)]" aria-hidden>
            <div className="rounded-[26px] bg-white p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-[#A8873A]">Prime Vitória</p>
              <p className="mt-3 font-prime-display text-2xl" style={{ color: "#111" }}>
                {T.empresas.mock.ola}
              </p>
              <p className="text-sm text-[#8A8A8A]">{T.empresas.mock.sub}</p>
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-[#ECE7DB] p-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#111] text-xl text-[#D9BC6A]">+</span>
                <span className="text-sm font-semibold">{T.empresas.mock.agendar}</span>
              </div>
              <p className="mt-5 text-xs font-semibold text-[#111]">{T.empresas.mock.proximas}</p>
              {[
                [T.empresas.mock.hoje, "Aeroporto → Enseada do Suá"],
                [T.empresas.mock.amanha, "Praia do Canto → Serra"]
              ].map(([a, b]) => (
                <div key={a} className="mt-2 rounded-2xl bg-[#F7F5F0] p-3">
                  <p className="text-sm font-semibold">{a}</p>
                  <p className="text-xs text-[#8A8A8A]">{b}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Frota */}
      <section id="frota" className="scroll-mt-20 bg-white py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <Kicker>{T.frota.kicker}</Kicker>
          <H2>{T.frota.title}</H2>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {T.frota.items.map((f, i) => (
              <article key={f.t} className="overflow-hidden rounded-[26px] border border-[#ECE7DB] bg-[#F7F5F0]">
                <img src={FLEET_IMG[i]} alt={f.t} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                <div className="p-5">
                  <H3>{f.t}</H3>
                  <p className="text-sm text-[#6F6A60]">{f.d}</p>
                </div>
              </article>
            ))}
          </div>
          <p className="mt-5 text-sm text-[#6F6A60]">{T.frota.extra}</p>
        </div>
      </section>

      {/* Fotos reais em operação (aparece quando houver fotos) */}
      {SITE.operacao.length > 0 ? (
        <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <Kicker>{T.operacao.kicker}</Kicker>
          <H2>{T.operacao.title}</H2>
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {SITE.operacao.map((p, i) => (
              <img
                key={p.src}
                src={p.src}
                alt={p.alt}
                loading="lazy"
                className={`w-full rounded-[22px] object-cover ${i === 0 ? "col-span-2 aspect-[16/10] sm:row-span-2 sm:aspect-auto sm:h-full" : "aspect-square"}`}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* Avaliações do Google */}
      <section className="px-5 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl rounded-[32px] border border-[#ECE7DB] bg-white p-7 sm:p-12">
          <div className="grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <Kicker>{T.google.kicker}</Kicker>
              <H2>{T.google.title}</H2>
              {google?.rating ? (
                <p className="mt-4 flex items-baseline gap-2">
                  <span className="font-prime-display text-5xl text-[#111]">{google.rating.toFixed(1).replace(".", ",")}</span>
                  <span className="text-xl text-[#E2B33C]">★★★★★</span>
                  {google.total ? <span className="text-sm text-[#8A8A8A]">{google.total} {T.reviewsWord}</span> : null}
                </p>
              ) : null}
              <p className="mt-4 text-base text-[#6F6A60]">{T.google.sub}</p>
            </div>
            <div className="flex flex-col gap-3">
              {google && google.reviews.length > 0 ? <GoogleReviewsTicker data={google} reviewsUrl={SITE.google.reviews} label={{ reviews: T.reviewsWord, close: T.close }} /> : null}
              <a href={SITE.google.reviews} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-3 rounded-full bg-[#111] px-6 py-4 font-semibold text-[#fff]">
                <span className="text-lg text-[#D9BC6A]" aria-hidden>
                  ★★★★★
                </span>
                {T.google.ver}
              </a>
              <a href={SITE.google.write} target="_blank" rel="noopener noreferrer" className="rounded-full px-6 py-4 text-center font-medium text-[#111] ring-1 ring-[#E2DCCD]">
                {T.google.avaliar}
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Diferenciais + cidades */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:pb-28">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <Kicker>{T.diferenciais.kicker}</Kicker>
            <H2>{T.diferenciais.title}</H2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {T.diferenciais.items.map((d) => (
                <li key={d} className="rounded-2xl border border-[#ECE7DB] bg-white px-4 py-3.5 text-sm font-medium">
                  {d}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <Kicker>{T.mapa.kicker}</Kicker>
            <H2>{T.mapa.title}</H2>
            <p className="mt-4 text-base text-[#6F6A60]">{T.mapa.sub}</p>
            <div className="mt-6 rounded-[28px] border border-[#ECE7DB] bg-white p-4">
              <BrazilMap sedeLabel={T.mapa.sede} />
            </div>
          </div>
        </div>
      </section>

      {/* Motorista parceiro */}
      <section className="px-5 pb-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 rounded-[32px] bg-[#111] p-7 sm:flex-row sm:items-center sm:justify-between sm:p-12">
          <div className="max-w-xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em]" style={{ color: "#D9BC6A" }}>
              {T.parceiro.kicker}
            </p>
            <h2 className="mt-3 font-prime-display text-[28px] leading-tight sm:text-[36px]" style={{ color: "#fff" }}>
              {T.parceiro.title}
            </h2>
            <p className="mt-3 text-sm" style={{ color: "rgba(255,255,255,0.72)" }}>
              {T.parceiro.sub}
            </p>
          </div>
          <a href={parceiroHref} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-[#D9BC6A] px-7 py-4 text-center font-semibold text-[#111]">
            {T.parceiro.cta}
          </a>
        </div>
      </section>

      {/* Contato */}
      <footer id="contato" className="scroll-mt-20 border-t border-[#ECE7DB] bg-white">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-3">
              <img src={SITE.img.logo} alt="" width={44} height={44} className="h-11 w-11 rounded-xl object-cover" />
              <div>
                <p className="font-prime-display text-lg font-semibold">Prime Vitória</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.28em] text-[#A8873A]">Transporte executivo</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-[#6F6A60]">{SITE.address}</p>
          </div>
          <div className="text-sm">
            <p className="font-semibold">{T.footer.fale}</p>
            <a href={SITE.phoneHref} className="mt-3 block text-[#6F6A60]">
              {SITE.phone}
            </a>
            <a href={wa} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[#6F6A60]">
              {SITE.mobile} · WhatsApp
            </a>
            <a href={`mailto:${SITE.email}`} className="mt-1 block text-[#6F6A60]">
              {SITE.email}
            </a>
            <div className="mt-4 flex gap-2">
              {SOCIAL.filter((x) => SITE.social[x.id]).map((x) => (
                <a
                  key={x.id}
                  href={SITE.social[x.id]}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={x.label}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F4F1EA] text-[#111] transition hover:bg-[#111] hover:text-[#D9BC6A]"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d={x.d} />
                  </svg>
                </a>
              ))}
            </div>
          </div>
          <div className="text-sm">
            <p className="font-semibold">{T.footer.acesso}</p>
            <Link href={agendar} className="mt-3 block text-[#6F6A60]">
              {T.nav.agendar}
            </Link>
            <Link href={empresa} className="mt-1 block text-[#6F6A60]">
              {T.nav.area}
            </Link>
            <Link href={SITE.links.motorista as Route} className="mt-1 block text-[#6F6A60]">
              {T.nav.motorista}
            </Link>
            <a href={parceiroHref} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[#6F6A60]">
              {T.parceiro.cta}
            </a>
            <a href={SITE.google.reviews} target="_blank" rel="noopener noreferrer" className="mt-1 block text-[#6F6A60]">
              Google
            </a>
            <Link href="/privacidade" className="mt-1 block text-[#6F6A60]">
              {T.footer.privacidade}
            </Link>
          </div>
        </div>
        <p className="border-t border-[#F2EEE6] px-5 py-5 text-center text-xs text-[#8A8A8A]">
          © {new Date().getFullYear()} Prime Vitória · R J Prime Transporte LTDA · CNPJ 49.126.277/0001-54
        </p>
      </footer>

      {/* WhatsApp flutuante */}
      <a
        href={wa}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={T.hero.whatsapp}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] shadow-xl"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden>
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.3 14.2c-.2.6-1.3 1.2-1.8 1.2-.5.1-1 .1-3.3-.8-2.8-1.1-4.5-3.9-4.7-4.1-.1-.2-1.1-1.5-1.1-2.9s.7-2 1-2.3c.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.3 0 .5l-.4.6-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.3 2.4 1.5.3.1.5.1.6-.1l.9-1.1c.2-.3.4-.2.7-.1l1.9.9c.3.1.5.2.5.3.1.2.1.7-.1 1.3z" />
        </svg>
      </a>
    </div>
  );
}
