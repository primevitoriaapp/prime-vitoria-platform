import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";
import { fail } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";

const BUCKET = "app-builds";

/** Baixar o APK de teste mais recente do app do motorista (só admin). O link vale 7 dias. */
export async function GET() {
  const session = await getSessionContext();
  if (session.role !== "admin") return fail("FORBIDDEN", "Só admin", 403);
  const { data: files } = await db.storage.from(BUCKET).list("driver", { limit: 50, sortBy: { column: "created_at", order: "desc" } });
  const f = (files ?? []).find((x) => x.name.endsWith(".apk"));
  if (!f) return fail("NOT_FOUND", "Ainda não há APK gerado", 404);
  const { data, error } = await db.storage.from(BUCKET).createSignedUrl(`driver/${f.name}`, 7 * 86400, { download: "Prime-Motorista.apk" });
  if (error || !data) return fail("SIGN_FAILED", error?.message ?? "Falhou", 500);
  return NextResponse.redirect(data.signedUrl, 302);
}
