import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail, mapApiError } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { withResolvedDriverId } from "@/lib/drivers/resolve-driver-for-session";
import { contractFileUrl, type ContractRow } from "@/lib/contracts/contracts";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await withResolvedDriverId(await getSessionContext());
    if (session.role !== "motorista" || !session.driverId) return fail("FORBIDDEN", "Só motorista", 403);
    const { id } = await params;
    const { data } = await db.from("contracts").select("*").eq("id", id).eq("driver_id", session.driverId).maybeSingle();
    if (!data) return fail("NOT_FOUND", "Contrato não encontrado", 404);
    const url = await contractFileUrl(data as ContractRow, "assinado");
    if (!url) return fail("NO_FILE", "Arquivo indisponível agora.", 404);
    return NextResponse.redirect(url);
  } catch (e) {
    return mapApiError(e);
  }
}
