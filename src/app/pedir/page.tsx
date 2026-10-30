import type { Metadata } from "next";
import { SITE } from "@/components/site/site-data";
import { PublicRequestForm, type FormLang } from "@/components/public-request-form";

const HEAD: Record<FormLang, { title: string; sub: string; termos: string; politica: string; voltar: string; site: string }> = {
  pt: { title: "Peça seu orçamento", sub: "Transfer, aeroporto, casamento, turismo e eventos. Respondemos rapidinho pelo WhatsApp.", termos: "Ao enviar, você concorda com a", politica: "política de privacidade", voltar: "← Voltar ao site", site: "/site" },
  en: { title: "Request a quote", sub: "Airport transfers, chauffeur by the hour, weddings, sightseeing and events. We reply quickly on WhatsApp.", termos: "By sending, you agree to our", politica: "privacy policy", voltar: "← Back to website", site: "/site/en" },
  es: { title: "Pide tu cotización", sub: "Traslados, aeropuerto, bodas, turismo y eventos. Respondemos rápido por WhatsApp.", termos: "Al enviar, aceptas nuestra", politica: "política de privacidad", voltar: "← Volver al sitio", site: "/site/es" }
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<{ lang?: string }> }): Promise<Metadata> {
  const { lang } = await searchParams;
  if (lang === "en") return { title: "Request a quote · Prime Vitória Executive Chauffeur" };
  if (lang === "es") return { title: "Pide tu cotización · Prime Vitória Transporte Ejecutivo" };
  return {
    title: "Pedir orçamento · Prime Vitória Transporte Executivo",
    description: "Transfer, aeroporto, casamento, turismo e eventos em Vitória/ES com carros executivos, SUVs, vans e ônibus."
  };
}

/** Página pública para pessoa física (ou empresa nova) pedir orçamento. */
export default async function PedirPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: raw } = await searchParams;
  const lang: FormLang = raw === "en" || raw === "es" ? raw : "pt";
  const h = HEAD[lang];
  return (
    <div className="min-h-dvh bg-[#F7F5F0]">
      <header className="px-5 pb-6 pt-[max(1.75rem,env(safe-area-inset-top))] text-center">
        <a href={h.site} className="inline-flex items-center gap-3">
          <img src={SITE.img.logo} alt="" width={44} height={44} className="h-11 w-11 rounded-xl object-cover" />
          <span className="text-left leading-tight">
            <span className="block font-prime-display text-lg font-semibold text-[#111]">Prime Vitória</span>
            <span className="block text-[9px] font-semibold uppercase tracking-[0.28em] text-[#A8873A]">Transporte executivo</span>
          </span>
        </a>
        <h1 className="mx-auto mt-7 max-w-md font-prime-display text-[30px] leading-tight" style={{ color: "#111" }}>
          {h.title}
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-[#6F6A60]">{h.sub}</p>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5">
        <PublicRequestForm lang={lang} />
        <p className="mt-6 text-center text-[11px] text-[#9A9A9A]">
          {h.termos}{" "}
          <a href="/privacidade" className="underline">
            {h.politica}
          </a>
          .
        </p>
        <p className="mt-4 text-center text-sm">
          <a href={h.site} className="text-[#8A8A8A]">
            {h.voltar}
          </a>
        </p>
      </main>
    </div>
  );
}
