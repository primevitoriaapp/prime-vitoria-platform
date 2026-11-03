/** Regras puras dos pedidos de alteração do motorista (veículo, CNH, PIX). */

export type ChangeKind = "vehicle" | "cnh" | "pix";

export type VehiclePayload = { brand: string; model: string; plate: string; color: string | null; model_year: number | null; vehicle_category_id: string | null };
export type CnhPayload = { cnh_number: string; cnh_category: string; cnh_expires_at: string };
export type PixPayload = { pix_key: string };

export function normalizePlate(raw: string): string {
  return String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Placa antiga (ABC1234) ou Mercosul (ABC1D23). */
export function isValidPlate(raw: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlate(raw));
}

export function formatPlate(raw: string): string {
  const p = normalizePlate(raw);
  return /^[A-Z]{3}[0-9]{4}$/.test(p) ? `${p.slice(0, 3)}-${p.slice(3)}` : p;
}

export function parseVehicle(input: Record<string, unknown>): { ok: true; value: VehiclePayload } | { ok: false; error: string } {
  const brand = String(input.brand ?? "").trim();
  const model = String(input.model ?? "").trim();
  const plate = String(input.plate ?? "");
  if (brand.length < 2) return { ok: false, error: "Informe a marca do carro." };
  if (model.length < 2) return { ok: false, error: "Informe o modelo do carro." };
  if (!isValidPlate(plate)) return { ok: false, error: "Placa inválida. Use o formato ABC1D23 ou ABC-1234." };
  const yearRaw = String(input.model_year ?? "").trim();
  const year = yearRaw ? Number(yearRaw) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1990 || year > new Date().getFullYear() + 1)) return { ok: false, error: "Ano do carro inválido." };
  const cat = String(input.vehicle_category_id ?? "").trim();
  return {
    ok: true,
    value: {
      brand: brand.slice(0, 40),
      model: model.slice(0, 60),
      plate: formatPlate(plate),
      color: String(input.color ?? "").trim().slice(0, 30) || null,
      model_year: year,
      vehicle_category_id: /^[0-9a-f-]{36}$/i.test(cat) ? cat : null
    }
  };
}

export function parseCnh(input: Record<string, unknown>, today = new Date()): { ok: true; value: CnhPayload } | { ok: false; error: string } {
  const number = String(input.cnh_number ?? "").replace(/\D/g, "");
  const category = String(input.cnh_category ?? "").toUpperCase().replace(/[^A-E]/g, "");
  const exp = String(input.cnh_expires_at ?? "");
  if (number.length !== 11) return { ok: false, error: "O número da CNH tem 11 dígitos." };
  if (!category || category.length > 3) return { ok: false, error: "Informe a categoria da CNH (ex.: B, D, AD)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exp)) return { ok: false, error: "Informe a validade da CNH." };
  const ymdToday = today.toISOString().slice(0, 10);
  if (exp < ymdToday) return { ok: false, error: "Essa CNH já está vencida. Envie a CNH nova." };
  return { ok: true, value: { cnh_number: number, cnh_category: category, cnh_expires_at: exp } };
}

export function parsePix(input: Record<string, unknown>): { ok: true; value: PixPayload } | { ok: false; error: string } {
  const key = String(input.pix_key ?? "").trim();
  if (key.length < 5 || key.length > 120) return { ok: false, error: "Informe a chave PIX (CPF, e-mail, celular ou chave aleatória)." };
  return { ok: true, value: { pix_key: key } };
}

export const KIND_LABEL: Record<ChangeKind, string> = { vehicle: "Troca de veículo", cnh: "CNH nova", pix: "Nova chave PIX" };
