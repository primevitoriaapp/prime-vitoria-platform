import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { approveQuote } from "@/lib/quotes/approve-quote";
import { validCpf } from "@/lib/drivers/driver-signup-fields";
import { formatQuoteNumber } from "@/lib/quotes/quote-calc";
import { pushToStaff } from "@/lib/push/web-push";
import { enqueueInAppForTenantRoles } from "@/lib/notifications/enqueue-for-profiles";

/** Dados de quem contrata (pessoa física): vão para o cadastro do cliente e para o contrato. */
const contratanteSchema = z.object({
  nome: z.string().trim().min(5).max(120),
  cpf: z.string().trim().max(20).refine(validCpf, "CPF inválido. Confira os números."),
  email: z.string().trim().email("Confira o e-mail.").max(200),
  telefone: z.string().trim().min(10).max(30),
  cep: z.string().trim().max(12).refine((v) => v.replace(/\D/g, "").length === 8, "CEP inválido."),
  endereco: z.string().trim().min(3).max(200),
  numero: z.string().trim().min(1).max(20),
  complemento: z.string().trim().max(80).optional(),
  bairro: z.string().trim().min(2).max(80),
  cidade: z.string().trim().min(2).max(80),
  uf: z.string().trim().length(2)
});

const bodySchema = z.object({
  t: z.string().regex(/^[A-Za-z0-9_-]{16,80}$/),
  action: z.enum(["aprovar", "ajuste"]),
  name: z.string().trim().min(2).max(120),
  message: z.string().trim().max(1500).optional(),
  contratante: contratanteSchema.optional()
});

const cpfMask = (v: string) => v.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const cepMask = (v: string) => v.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2");

/** O cliente responde pelo link do orçamento: aprova (corridas entram na agenda) ou pede ajuste. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = bodySchema.parse(await request.json());
    const { data: q } = await db.from("quotes").select("id, tenant_id, number, status, valid_until, share_token, contact_name, client_id, issuer").eq("id", id).eq("share_token", body.t).maybeSingle();
    if (!q) return fail("NOT_FOUND", "Orçamento não encontrado", 404);
    if (q.status === "aprovado") return ok({ status: "aprovado", already: true });
    if (["recusado", "cancelado"].includes(q.status as string)) return fail("CLOSED", "Este orçamento foi encerrado. Fale com a Prime.", 409);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    if (q.valid_until && (q.valid_until as string) < today) return fail("EXPIRED", "Este orçamento venceu. Peça uma atualização à Prime.", 409);

    const tenantId = q.tenant_id as string;
    const number = formatQuoteNumber(q.number as number);
    const note = `${body.action === "aprovar" ? "Aprovado" : "Pedido de ajuste"} pelo cliente (${body.name}) em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}${body.message ? `: ${body.message}` : ""}`;
    await db.from("quotes").update({ client_response: note, client_responded_at: new Date().toISOString() }).eq("id", id);

    // Pessoa física sem cadastro: na aprovação, os dados do contrato são obrigatórios.
    if (body.action === "aprovar" && !q.client_id && !body.contratante)
      return fail("CONTRATANTE_REQUIRED", "Preencha seus dados para o contrato.", 400);
    let dataNote = "";
    if (body.action === "aprovar" && body.contratante && !q.client_id) {
      const c = body.contratante;
      const doc = cpfMask(c.cpf);
      const address = [c.endereco, c.numero, c.complemento, c.bairro].filter((x) => x && x.trim()).join(", ");
      const fields = {
        name: c.nome,
        document: doc,
        email: c.email,
        phone: c.telefone,
        whatsapp: c.telefone,
        address_line: address,
        city: c.cidade,
        state: c.uf.toUpperCase(),
        postal_code: cepMask(c.cep)
      };
      // Cliente que já existe com o mesmo CPF: atualiza os dados; senão, cria o cadastro.
      const { data: existing } = await db.from("clients").select("id").eq("tenant_id", tenantId).in("document", [doc, c.cpf.replace(/\D/g, "")]).limit(1).maybeSingle();
      let clientId = existing?.id as string | undefined;
      if (clientId) await db.from("clients").update(fields).eq("id", clientId);
      else {
        const { data: created, error: cErr } = await db
          .from("clients")
          .insert({ ...fields, tenant_id: tenantId, type: "PF", billing_issuer: (q.issuer as string | null) ?? "prime_servicos", invoiced: false })
          .select("id")
          .single();
        if (cErr) return fail("CLIENT_FAILED", "Não conseguimos salvar seus dados. Tente de novo ou fale com a Prime.", 500);
        clientId = created.id as string;
      }
      await db
        .from("quotes")
        .update({ client_id: clientId, contact_name: c.nome, contact_document: doc, contact_email: c.email, contact_phone: c.telefone, contact_type: "PF" })
        .eq("id", id);
      dataNote = " Dados do contrato recebidos.";
    }

    let result: { status: string; trips?: number; pending?: string } = { status: "ajuste" };
    if (body.action === "aprovar") {
      const r = await approveQuote(tenantId, id, null);
      // Se faltou dado (ex.: horário), a aprovação fica registrada e a central completa e confirma.
      result = r.ok ? { status: "aprovado", trips: r.trips } : { status: "aprovado_pendente", pending: r.message };
    }

    const title = body.action === "aprovar" ? `✅ ${number} aprovado pelo cliente` : `✏️ ${number}: cliente pediu ajuste`;
    const text =
      (result.status === "aprovado_pendente" ? `${body.name} aprovou, mas falta completar: ${result.pending}` : `${body.name}${body.message ? `: ${body.message.slice(0, 120)}` : ""}`) +
      (dataNote ? `${dataNote} Gere o contrato no orçamento.` : "");
    await Promise.allSettled([
      pushToStaff(tenantId, { title, body: text, url: `/orcamentos?abrir=${id}`, tag: `quote-${id}` }),
      enqueueInAppForTenantRoles(tenantId, ["admin", "operador"], { eventType: "operations.quote_response", quoteId: id, title, body: text }, { correlation_id: `quote-${id}-${Date.now()}` })
    ]);
    return ok(result);
  } catch (error) {
    return mapApiError(error);
  }
}
