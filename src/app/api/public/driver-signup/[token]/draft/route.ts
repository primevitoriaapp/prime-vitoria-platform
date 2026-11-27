import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { leadBySignupToken } from "@/lib/leads/signup-token";

const val = z.union([z.string().max(400), z.array(z.string().max(80)).max(40)]);
const schema = z.object({
  step: z.number().int().min(0).max(20),
  data: z.record(val).refine((d) => Object.keys(d).length <= 80, "Muitos campos")
});

/** Progresso do cadastro completo, para a central acompanhar quem está preenchendo (e onde parou). */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const lead = await leadBySignupToken(token);
    if (!lead) return fail("NOT_FOUND", "Link inválido", 404);
    if (lead.completed_at) return ok({ saved: false });
    const p = schema.safeParse(await request.json().catch(() => ({})));
    if (!p.success) return fail("VALIDATION_ERROR", "Rascunho inválido", 400);
    // Só campos preenchidos; arquivos não passam aqui (já ficam no armazenamento privado).
    const data = Object.fromEntries(Object.entries(p.data.data).filter(([, x]) => (Array.isArray(x) ? x.length : String(x).trim() !== "")));
    await db.from("site_leads").update({ draft_data: data, draft_step: p.data.step, draft_at: new Date().toISOString() }).eq("id", lead.id);
    return ok({ saved: true });
  } catch (e) {
    return mapApiError(e);
  }
}
