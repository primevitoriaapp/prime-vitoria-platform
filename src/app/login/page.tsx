import { AppSplash } from "@/components/app-splash";
import type { Metadata } from "next";
import { LoginForm } from "./login-form";

type Sp = Promise<{ next?: string; troca?: string }>;

/** No login do portal da empresa, o "instalar app" instala o app da empresa (não o da central). */
export async function generateMetadata({ searchParams }: { searchParams: Sp }): Promise<Metadata> {
  const { next } = await searchParams;
  if ((next ?? "").startsWith("/client")) {
    return {
      title: "Prime Vitória — Empresas",
      manifest: "/manifest-cliente.json",
      appleWebApp: { capable: true, title: "Prime Empresas", statusBarStyle: "black-translucent" }
    };
  }
  return { title: "Prime Vitória — Central" };
}

export default async function LoginPage({ searchParams }: { searchParams: Sp }) {
  const params = await searchParams;
  const area = (params.next ?? "").startsWith("/client") ? "Empresas" : "Central";
  return (
    <>
      <AppSplash area={area} />
      <LoginForm defaultNext={params.next} switchAccount={params.troca === "1"} />
    </>
  );
}
