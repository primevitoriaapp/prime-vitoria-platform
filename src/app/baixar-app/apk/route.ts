import { NextResponse } from "next/server";
import { db } from "@/lib/server/db";

export const dynamic = "force-dynamic";

/**
 * Download público do app do motorista (APK assinado mais recente).
 * Pode ser público: o app só abre o login do motorista (CPF + PIN). Não expõe dado nenhum.
 */
export async function GET() {
  const { data: files } = await db.storage.from("app-builds").list("driver", { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  // Só a versão assinada oficial (tem "-v" no nome); a de teste antiga fica de fora.
  const f = (files ?? []).find((x) => x.name.endsWith(".apk") && /-v\d+\.apk$/.test(x.name));
  if (!f) return new NextResponse("App ainda não disponível.", { status: 404 });
  const { data } = await db.storage.from("app-builds").createSignedUrl(`driver/${f.name}`, 600, { download: "Prime-Motorista.apk" });
  if (!data) return new NextResponse("Tente de novo em instantes.", { status: 503 });
  return NextResponse.redirect(data.signedUrl, 302);
}
