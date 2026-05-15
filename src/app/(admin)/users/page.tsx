import Link from "next/link";
import { can } from "@/lib/security/rbac";
import { getSessionContext } from "@/lib/server/session";
import { ProfileClientScopePanel } from "@/components/profile-client-scope-panel";

export default async function UsersPage() {
  const session = await getSessionContext();

  if (!can(session, "profiles.read")) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16">
        <p className="text-slate-700">Sem permissão para consultar utilizadores da organização.</p>
        <Link href="/dashboard" className="mt-4 inline-block text-amber-700 underline">
          Voltar ao painel
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-5 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Utilizadores</h1>
          <p className="mt-1 text-sm text-slate-600">
            Perfis da organização. Para contas com papel <strong>cliente</strong>, defina o cliente corporativo
            associado (acesso ao portal <code className="text-xs">/client</code>).
          </p>
        </div>
        <Link href="/dashboard" className="text-sm font-medium text-amber-700 hover:underline">
          Painel
        </Link>
      </div>
      <ProfileClientScopePanel />
    </main>
  );
}
