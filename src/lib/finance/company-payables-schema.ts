import { z } from "zod";

const money = z.union([z.number(), z.string()]).transform((v, ctx) => {
  const t = String(v).trim();
  const n = typeof v === "number" ? v : Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  if (!Number.isFinite(n) || n < 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Valor inválido" });
    return z.NEVER;
  }
  return Math.round(n * 100) / 100;
});

export const payableSchema = z.object({
  description: z.string().trim().min(2).max(200),
  category: z.string().trim().max(40).default("outros"),
  supplier: z.string().trim().max(120).nullable().optional(),
  amount: money,
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recurrence: z.enum(["nenhuma", "mensal"]).default("nenhuma"),
  issuer: z.enum(["rj_prime", "prime_servicos", "ilha_prime"]).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  installments: z.coerce.number().int().min(1).max(60).optional()
});

export function staffFinance(role: string) {
  return role === "admin" || role === "financeiro";
}

