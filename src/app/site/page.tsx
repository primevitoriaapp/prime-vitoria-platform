import type { Metadata } from "next";
import { SiteHome } from "@/components/site/site-home";
import { SITE_TEXT } from "@/components/site/site-i18n";

export const metadata: Metadata = {
  metadataBase: new URL("https://primevitoria.com"),
  title: SITE_TEXT.pt.meta.title,
  description: SITE_TEXT.pt.meta.description,
  alternates: { canonical: "/", languages: { "pt-BR": "/", en: "/en", es: "/es" } },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Prime Vitória",
    locale: "pt_BR",
    title: SITE_TEXT.pt.meta.title,
    description: SITE_TEXT.pt.meta.description,
    images: [{ url: "/site/op-orla.webp", width: 1200, height: 630, alt: "Prime Vitória — Transporte Executivo" }]
  },
  robots: { index: true, follow: true }
};

export default function Page() {
  return <SiteHome lang="pt" />;
}
