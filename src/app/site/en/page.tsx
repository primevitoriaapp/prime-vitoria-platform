import type { Metadata } from "next";
import { SiteHome } from "@/components/site/site-home";
import { SITE_TEXT } from "@/components/site/site-i18n";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.primevitoria.com"),
  title: SITE_TEXT.en.meta.title,
  description: SITE_TEXT.en.meta.description,
  alternates: { canonical: "/en", languages: { "pt-BR": "/", en: "/en", es: "/es" } },
  openGraph: {
    type: "website",
    url: "/en",
    siteName: "Prime Vitória",
    locale: "en_US",
    title: SITE_TEXT.en.meta.title,
    description: SITE_TEXT.en.meta.description,
    images: [{ url: "/site/op-orla.webp", width: 1200, height: 630, alt: "Prime Vitória — Transporte Executivo" }]
  },
  robots: { index: true, follow: true }
};

export default function Page() {
  return <SiteHome lang="en" />;
}
