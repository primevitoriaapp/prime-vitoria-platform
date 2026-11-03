import type { Metadata, Viewport } from "next";
import { StandaloneAppRouter } from "@/components/standalone-app-router";
import { PwaRootRegister } from "@/components/pwa-root-register";

export const metadata: Metadata = {
  title: "Prime Vitória — Empresas",
  description: "Peça e acompanhe as corridas da sua empresa.",
  manifest: "/manifest-cliente.json",
  appleWebApp: {
    capable: true,
    title: "Prime Empresas",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#111111",
  viewportFit: "cover"
};

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PwaRootRegister />
      <StandaloneAppRouter mark="client" />
      {children}
    </>
  );
}
