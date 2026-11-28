import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/** Download público do app das empresas (APK assinado mais recente). O app só abre o login do portal. */
export async function GET() {
  const { data: files } = await db.storage.from("app-builds").list("empresa", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  const f = (files ?? []).find((x) => /-v\d+\.apk$/.test(x.name));
  if (!f) return new NextResponse("App ainda não disponível.", { status: 404 });
  const { data } = await db.storage.from("app-builds").createSignedUrl(`empresa/${f.name}`, 600, { download: "Prime-Empresas.apk" });
  if (!data) return new NextResponse("Tente de novo em instantes.", { status: 503 });
  return NextResponse.redirect(data.signedUrl, 302);
}
