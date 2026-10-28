import { z } from "zod";
import { db } from "@/lib/server/db";

export const runtime = "nodejs";

/** Foto da categoria de veículo (mostrada no portal e no painel). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) return new Response(null, { status: 404 });
    const { data: cat } = await db.from("vehicle_categories").select("photo_path").eq("id", id).maybeSingle();
    const path = cat?.photo_path as string | null;
    if (!path) return new Response(null, { status: 404 });
    const { data, error } = await db.storage.from("tenant-assets").download(path);
    if (error || !data) return new Response(null, { status: 404 });
    const ext = path.split(".").pop();
    const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return new Response(data, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=86400" } });
  } catch {
    return new Response(null, { status: 404 });
  }
}
