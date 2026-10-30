import type { Metadata, Viewport } from "next";
import { DriverPwaRegister } from "@/components/driver-pwa-register";
import { AppSplash } from "@/components/app-splash";
import { StandaloneAppRouter } from "@/components/standalone-app-router";

export const metadata: Metadata = {
  title: "Prime Vitória — Motorista",
  description: "Painel operacional do motorista.",
  manifest: "/manifest-motorista.json",
  appleWebApp: {
    capable: true,
    title: "Prime Motorista",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#111111",
  viewportFit: "cover"
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DriverPwaRegister />
      <AppSplash />
      <StandaloneAppRouter mark="driver" />
      {children}
    </>
  );
}
