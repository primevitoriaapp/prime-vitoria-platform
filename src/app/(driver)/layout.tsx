import type { Metadata, Viewport } from "next";
import { DriverPwaRegister } from "@/components/driver-pwa-register";

export const metadata: Metadata = {
  title: "Prime Vitória — Motorista",
  description: "Painel operacional do motorista.",
  manifest: "/manifest-motorista.json",
  appleWebApp: {
    capable: true,
    title: "PV Motorista",
    statusBarStyle: "black-translucent"
  }
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  viewportFit: "cover"
};

export default function DriverLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DriverPwaRegister />
      {children}
    </>
  );
}
