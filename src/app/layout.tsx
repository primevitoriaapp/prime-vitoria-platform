import type { Metadata, Viewport } from "next";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plataforma Prime Vitória",
  description: "Plataforma operacional de transporte executivo."
};

export const viewport: Viewport = {
  themeColor: "#F8F6F1",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="prime-theme">
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
