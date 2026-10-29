import Link from "next/link";
import { AdminPageHeader } from "@/components/admin-page-header";
import { StaffUsersPanel } from "@/components/staff-users-panel";
import { ProfileClientScopePanel } from "@/components/profile-client-scope-panel";
import { getSessionContext } from "@/lib/server/session";

export default async function UsersPage() {
  const session = await getSessionContext();
  if (session.role !== "admin") {
    return (
      <div className="py-16 text-center">
        <p>Só o administrador gerencia os usuários.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-prime-gold underline">
          Voltar ao painel
        </Link>
      </div>
    );
  }
  return (
    <div className="pb-10">
      <AdminPageHeader
        title="Usuários"
        subtitle="Quem da equipe entra no painel e o que cada um pode fazer. Acesso de clientes fica em Clientes → empresa → Equipe."
      />
      <StaffUsersPanel />
      <details className="mt-10 rounded-2xl border border-prime-border bg-white shadow-prime-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Avançado: todas as contas e vínculo de clientes</summary>
        <div className="border-t border-prime-border p-4">
          <ProfileClientScopePanel />
        </div>
      </details>
    </div>
  );
}
