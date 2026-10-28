import { redirect } from "next/navigation";
import { AdminAppShell } from "@/components/admin-app-shell";
import { getSessionContext } from "@/lib/server/session";

/** Painel da Prime: só equipe (admin, operador, financeiro). Cliente ou motorista vai para o login. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionContext();
  if (session.role !== "admin" && session.role !== "operador" && session.role !== "financeiro") {
    redirect("/login?troca=1");
  }
  return <AdminAppShell>{children}</AdminAppShell>;
}
