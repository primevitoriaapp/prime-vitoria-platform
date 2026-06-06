import { z } from "zod";
import { normalizeServiceTypes } from "@/lib/clients/client-service-types";

export const clientCadastroSchema = z.object({
  type: z.enum(["PF", "PJ"]),
  name: z.string().min(2),
  trade_name: z.string().optional().nullable(),
  document: z.string().optional().nullable(),
  email: z.union([z.string().email(), z.literal(""), z.null()]).optional(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  address_line: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  postal_code: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  registry_status: z.string().optional().nullable(),
  active: z.boolean().optional(),
  portal_requests_enabled: z.boolean().optional(),
  service_types: z.array(z.string()).optional()
});

export type ClientCadastroInput = z.infer<typeof clientCadastroSchema>;

const emptyToNull = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

export function normalizeClientBody(body: ClientCadastroInput) {
  const service_types = body.type === "PJ" ? normalizeServiceTypes(body.service_types) : [];
  return {
    type: body.type,
    name: body.name.trim(),
    trade_name: emptyToNull(body.trade_name ?? undefined),
    document: emptyToNull(body.document ?? undefined),
    email: emptyToNull(body.email ?? undefined),
    phone: emptyToNull(body.phone ?? undefined),
    whatsapp: emptyToNull(body.whatsapp ?? undefined),
    address_line: emptyToNull(body.address_line ?? undefined),
    city: emptyToNull(body.city ?? undefined),
    state: emptyToNull(body.state ?? undefined)?.toUpperCase() ?? null,
    postal_code: emptyToNull(body.postal_code ?? undefined),
    notes: emptyToNull(body.notes ?? undefined),
    registry_status: emptyToNull(body.registry_status ?? undefined),
    active: body.active,
    portal_requests_enabled: body.portal_requests_enabled,
    ...(body.type === "PJ" ? { service_types } : {})
  };
}

/** Campos presentes no PATCH — não exige name/type. */
export function normalizeClientPatch(body: Partial<ClientCadastroInput>) {
  const out: Record<string, unknown> = {};
  if (body.type !== undefined) out.type = body.type;
  if (body.name !== undefined) out.name = body.name.trim();
  if (body.trade_name !== undefined) out.trade_name = emptyToNull(body.trade_name ?? undefined);
  if (body.document !== undefined) out.document = emptyToNull(body.document ?? undefined);
  if (body.email !== undefined) out.email = emptyToNull(body.email ?? undefined);
  if (body.phone !== undefined) out.phone = emptyToNull(body.phone ?? undefined);
  if (body.whatsapp !== undefined) out.whatsapp = emptyToNull(body.whatsapp ?? undefined);
  if (body.address_line !== undefined) out.address_line = emptyToNull(body.address_line ?? undefined);
  if (body.city !== undefined) out.city = emptyToNull(body.city ?? undefined);
  if (body.state !== undefined) out.state = emptyToNull(body.state ?? undefined)?.toUpperCase() ?? null;
  if (body.postal_code !== undefined) out.postal_code = emptyToNull(body.postal_code ?? undefined);
  if (body.notes !== undefined) out.notes = emptyToNull(body.notes ?? undefined);
  if (body.registry_status !== undefined) {
    out.registry_status = emptyToNull(body.registry_status ?? undefined);
  }
  if (body.service_types !== undefined) {
    out.service_types = normalizeServiceTypes(body.service_types);
  }
  if (body.active !== undefined) out.active = body.active;
  if (body.portal_requests_enabled !== undefined) {
    out.portal_requests_enabled = body.portal_requests_enabled;
  }
  return out;
}
