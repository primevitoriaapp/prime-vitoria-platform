import Link from "next/link";
import type { Route } from "next";
import { z } from "zod";
import { getSessionContext } from "@/lib/server/session";
import { DEFAULT_TENANT_ID } from "@/lib/tenant/default-tenant";
import { loadInvoiceDetail } from "@/lib/finance/invoice-detail";
import { InvoiceOverview } from "@/components/invoice-overview";
import { InvoiceDetailActions } from "@/components/invoice-detail-actions";
import { InvoiceServicesEditor } from "@/components/invoice-services-editor";
import { formatInvoiceNumber } from "@/lib/finance/client-invoice-calc";

export const dynamic = "force-dynamic";

/** Fatura completa para a equipe Prime: etapas, serviços, histórico, motoristas, margem e ações. */
export default async function InvoiceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nova?: string }> }) {
  const { id } = await params;
  const nova = (await searchParams).nova === "1";
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
      {nova ? (
        <div className="rounded-2xl bg-emerald-600 p-4 text-[#fff]">
          <p className="text-base font-bold">✓ Fatura {formatInvoiceNumber(inv.number)} fechada · {detail.client_name}</p>
          <p className="mt-1 text-sm">Falta pouco: 1) anexe a nota fiscal · 2) anexe o boleto (se tiver) · 3) clique em “Enviar ao cliente”. Tudo aqui embaixo.</p>
        </div>
      ) : null}
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
            nf_extra_paths: inv.nf_extra_paths ?? [],
            voucher_path: inv.voucher_path ?? null
          }}
        />
      ) : null}
      {session.role === "admin" || session.role === "financeiro" ? <InvoiceServicesEditor invoiceId={inv.id} status={inv.status} /> : null}
    </div>
  );
}
