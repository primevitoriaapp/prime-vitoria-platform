import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { SystemHealthPanel } from "@/components/system-health-panel";
import { getSessionContext } from "@/lib/server/session";

export default async function SaudePage() {
  const session = await getSessionContext();
  if (session.role !== "admin") {
    return (
      <div className="py-16 text-center">
        <p>Só o administrador vê a checagem do sistema.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-prime-gold underline">
          Voltar ao painel
        </Link>
      </div>
    );
  }
  return (
    <div className="pb-10">
      <AdminPageHeader title="Checagem do sistema" subtitle="Todo dia às 7h e às 18h o sistema confere o que pode dar problema e te avisa. Aqui você vê o resultado." />
      <SystemHealthPanel />
    </div>
  );
}
