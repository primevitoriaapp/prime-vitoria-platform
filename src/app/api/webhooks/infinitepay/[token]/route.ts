import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fromCents, infinitepayPaymentCheck } from "@/lib/integrations/infinitepay";
import { markLinkPaid } from "@/lib/finance/payment-links";

export const dynamic = "force-dynamic";

/**
 * Aviso da InfinitePay quando o cliente paga. O endereço tem um código secreto por link,
 * e mesmo assim o pagamento só é aceito depois de conferido na própria InfinitePay.
 */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || !token || token.length < 16) return NextResponse.json({ ok: false }, { status: 400 });

  const { data: link } = await db.from("payment_links").select("id, order_nsu, slug, status").eq("hook_token", token).maybeSingle();
  if (!link) return NextResponse.json({ ok: false }, { status: 400 });
  if (link.status === "pago") return NextResponse.json({ ok: true, already: true });

  const orderNsu = String(body.order_nsu ?? "");
  if (orderNsu && orderNsu !== link.order_nsu) return NextResponse.json({ ok: false }, { status: 400 });
  const transactionNsu = String(body.transaction_nsu ?? "");
  const slug = String(body.invoice_slug ?? body.slug ?? link.slug ?? "");
  if (!transactionNsu || !slug) return NextResponse.json({ ok: true, ignored: "sem pagamento" });

  try {
    const check = await infinitepayPaymentCheck({ orderNsu: link.order_nsu as string, transactionNsu, slug });
    if (!check.success || !check.paid) return NextResponse.json({ ok: true, paid: false });
    await markLinkPaid(link.id as string, {
      paid_amount: check.paid_amount ?? fromCents(body.paid_amount),
      installments: check.installments ?? (body.installments == null ? null : Number(body.installments)),
      capture_method: check.capture_method ?? ((body.capture_method as string | null) ?? null),
      transaction_nsu: transactionNsu,
      receipt_url: typeof body.receipt_url === "string" ? body.receipt_url : null,
      slug,
      raw: body
    });
    return NextResponse.json({ ok: true, paid: true });
  } catch {
    // Erro do nosso lado: a InfinitePay tenta de novo depois.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
