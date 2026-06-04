import type { PostgrestError } from "@supabase/supabase-js";

export type MappedDbError = {
  code: string;
  message: string;
  hint?: string;
  status: number;
};

/** Traduz erros PostgREST/Postgres para mensagens acionáveis na UI. */
export function mapSupabaseError(error: PostgrestError, context: string): MappedDbError {
  const raw = error.message ?? "Erro desconhecido na base de dados";
  const pgCode = error.code ?? "";

  if (/column .* does not exist|Could not find the .* column|schema cache/i.test(raw)) {
    return {
      code: "MIGRATION_0044_REQUIRED",
      message: `Não foi possível guardar ${context}: a base de dados ainda não tem os campos de cadastro P1.`,
      hint: "Peça para aplicar a migration 0044 no Supabase de staging (workflow «Staging migration 0044» ou npm run db:apply-0044-staging).",
      status: 503
    };
  }

  if (pgCode === "23505" || /duplicate key|unique constraint/i.test(raw)) {
    return {
      code: "DUPLICATE_CLIENT",
      message: "Já existe um cliente com este documento ou identificador.",
      hint: "Verifique o CPF/CNPJ ou edite o registo existente.",
      status: 409
    };
  }

  if (pgCode === "23503" || /foreign key/i.test(raw)) {
    return {
      code: "REFERENCE_ERROR",
      message: "Referência inválida (empresa/tenant).",
      hint: "Confirme que a sessão está no tenant correcto e que o seed foi executado.",
      status: 400
    };
  }

  if (pgCode === "23514" || /check constraint/i.test(raw)) {
    return {
      code: "INVALID_DATA",
      message: raw.includes("type") ? "Tipo de cliente inválido (use PF ou PJ)." : raw,
      status: 400
    };
  }

  return {
    code: `${context.toUpperCase()}_DB_ERROR`,
    message: raw,
    hint: pgCode ? `Código Postgres/PostgREST: ${pgCode}` : undefined,
    status: 500
  };
}

export function isMissingColumnError(error: PostgrestError): boolean {
  const raw = error.message ?? "";
  return /column .* does not exist|Could not find the .* column|schema cache/i.test(raw);
}
