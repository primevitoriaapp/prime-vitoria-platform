import type { Metadata } from "next";
import { SiteHome } from "@/components/site/site-home";
import { SITE_TEXT } from "@/components/site/site-i18n";

export const metadata: Metadata = {
  title: SITE_TEXT.pt.meta.title,
  description: SITE_TEXT.pt.meta.description,
  alternates: { languages: { "pt-BR": "/site", en: "/site/en", es: "/site/es" } }
};

export default function Page() {
  return <SiteHome lang="pt" />;
}
