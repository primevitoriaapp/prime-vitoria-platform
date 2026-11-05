import Link from "next/link";
import type { Route } from "next";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { loadInvoiceDetail } from "@/lib/finance/invoice-detail";
import { InvoiceOverview } from "@/components/invoice-overview";
import { InvoiceDetailActions } from "@/components/invoice-detail-actions";
import { formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";

export const dynamic = "force-dynamic";

/** Fatura completa para a equipe Prime: etapas, serviços, histórico, motoristas, margem e ações. */
export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionContext();
  const staff = session.role === "admin" || session.role === "financeiro" || session.role === "operador";
  if (!staff || !z.string().uuid().safeParse(id).success) {
    return <p className="card text-sm">Fatura não encontrada.</p>;
  }
  const tenantId = session.tenantId ?? DEFAULT_TENANT_ID;
  const detail = await loadInvoiceDetail(tenantId, id, { internal: true });
  if (!detail) return <p className="card text-sm">Fatura não encontrada.</p>;
  const inv = detail.invoice;
  return (
    <div className="mx-auto grid max-w-6xl gap-4">
      <Link href={"/finance" as Route} className="text-sm text-prime-muted hover:underline">
        ← Faturas e recebimentos
      </Link>
      <InvoiceOverview detail={detail} />
      {session.role !== "operador" ? (
        <InvoiceDetailActions
          inv={{
            id: inv.id,
            title: `${formatInvoiceNumber(inv.number)}${inv.client_ref ? ` · ${inv.client_ref}` : ""} · ${detail.client_name}`,
            status: inv.status,
            due_date: inv.due_date,
            sent_at: inv.sent_at,
            boleto_path: inv.boleto_path ?? null,
            boleto_line: inv.boleto_line,
            nf_path: inv.nf_path ?? null,
            voucher_path: inv.voucher_path ?? null
          }}
        />
      ) : null}
    </div>
  );
}
