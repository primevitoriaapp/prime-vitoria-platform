import { z } from "zod";
import { BENEFIT_KINDS, PROSPECT_STAGES } from "@/lib/club/club";

const txt = (max: number) => z.string().trim().max(max).nullable().optional();
const url = z.string().trim().max(500).nullable().optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("").transform(() => null));

/** Campos que o painel pode gravar em cada tabela do clube. */
export const CLUB_ENTITIES = {
  categories: {
    table: "club_categories",
    order: "position",
    schema: z.object({ name: z.string().trim().min(2).max(60), icon: z.string().trim().max(20).optional(), position: z.coerce.number().int().optional(), active: z.boolean().optional() })
  },
  partners: {
    table: "club_partners",
    order: "name",
    schema: z.object({
      name: z.string().trim().min(2).max(120),
      category_id: z.string().uuid().nullable().optional(),
      description: txt(3000),
      logo_url: url,
      cover_url: url,
      phone: txt(30),
      whatsapp: txt(30),
      website: url,
      instagram: txt(80),
      status: z.enum(["rascunho", "publicado", "inativo"]).optional(),
      publish_at: z.string().datetime({ offset: true }).nullable().optional().or(z.literal("").transform(() => null)),
      featured: z.boolean().optional(),
      notes: txt(3000),
      /** PIN de 4 a 6 números que o estabelecimento usa para validar a carteirinha. Gravado só como hash. */
      validation_pin: z.string().regex(/^\d{4,6}$/, "PIN de 4 a 6 números").optional()
    })
  },
  branches: {
    table: "club_branches",
    order: "name",
    schema: z.object({
      partner_id: z.string().uuid().optional(),
      name: z.string().trim().min(2).max(120),
      address: txt(240),
      city: txt(80),
      uf: z.string().trim().max(2).nullable().optional(),
      lat: z.coerce.number().min(-90).max(90).nullable().optional(),
      lng: z.coerce.number().min(-180).max(180).nullable().optional(),
      hours: txt(240),
      phone: txt(30),
      whatsapp: txt(30),
      active: z.boolean().optional()
    })
  },
  benefits: {
    table: "club_benefits",
    order: "created_at",
    schema: z.object({
      partner_id: z.string().uuid().optional(),
      branch_ids: z.array(z.string().uuid()).nullable().optional(),
      title: z.string().trim().min(2).max(140),
      description: txt(2000),
      kind: z.enum(BENEFIT_KINDS),
      value: z.coerce.number().min(0).max(100000).nullable().optional(),
      coupon_code: txt(60),
      external_url: url,
      rules: txt(3000),
      valid_from: date,
      valid_until: date,
      max_uses_per_driver: z.coerce.number().int().min(1).max(1000).nullable().optional(),
      max_uses_per_month: z.coerce.number().int().min(1).max(1000).nullable().optional(),
      featured: z.boolean().optional(),
      active: z.boolean().optional()
    })
  },
  prospects: {
    table: "club_prospects",
    order: "updated_at",
    schema: z.object({
      company: z.string().trim().min(2).max(140),
      category: txt(60),
      city: txt(80),
      contact_name: txt(120),
      phone: txt(30),
      email: txt(200),
      stage: z.enum(PROSPECT_STAGES.map((s) => s[0]) as [string, ...string[]]).optional(),
      owner: txt(80),
      next_followup: date,
      proposal: txt(3000),
      notes: txt(3000),
      partner_id: z.string().uuid().nullable().optional()
    })
  }
} as const;

export type ClubEntity = keyof typeof CLUB_ENTITIES;
export const isClubEntity = (e: string): e is ClubEntity => e in CLUB_ENTITIES;
