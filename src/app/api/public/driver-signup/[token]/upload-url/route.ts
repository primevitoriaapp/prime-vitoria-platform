import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { leadBySignupToken, signupFolder } from "@/lib/leads/signup-token";
import { SIGNUP_FILE_KINDS } from "@/lib/drivers/driver-signup-fields";

const schema = z.object({
  kind: z.string(),
  file_name: z.string().trim().min(1).max(200),
  size: z.number().int().positive().max(12 * 1024 * 1024),
  type: z.string().max(100).optional()
});

/** Link para o celular do motorista mandar o documento direto ao armazenamento privado. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const lead = await leadBySignupToken(token);
    if (!lead) return fail("NOT_FOUND", "Link inválido ou expirado. Fale com a central.", 404);
    if (lead.completed_at) return fail("DONE", "Este cadastro já foi enviado.", 409);
    const p = schema.safeParse(await request.json().catch(() => ({})));
    if (!p.success || !SIGNUP_FILE_KINDS.has(p.data.kind)) return fail("VALIDATION_ERROR", "Envie arquivos de até 10 MB.", 400);
    if (p.data.type && !/^(image\/|application\/pdf)/.test(p.data.type)) return fail("VALIDATION_ERROR", "Envie foto ou PDF.", 400);
    const ext = (p.data.file_name.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${signupFolder(lead)}${p.data.kind}-${Date.now()}.${ext}`;
    const { data, error } = await db.storage.from("driver-docs").createSignedUploadUrl(path);
    if (error || !data) return fail("UPLOAD_URL_FAILED", "Não foi possível preparar o envio. Tente de novo.", 500);
    return ok({ path, url: data.signedUrl });
  } catch (e) {
    return mapApiError(e);
  }
}
