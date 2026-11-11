import { z } from "zod";

/**
 * E-mail tolerante a digitação: tira espaços (inclusive no meio, comum ao colar do WhatsApp)
 * e põe em minúsculas antes de validar. Vazio vira null. Assim um espaço sobrando não
 * derruba o cadastro inteiro.
 */
export const emailField = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v === null) return null;
    const t = String(v).replace(/\s+/g, "").toLowerCase();
    return t ? t : null;
  },
  z.union([z.string().email("E-mail inválido (confira se tem @ e o final, ex.: nome@gmail.com)").max(254), z.null()])
).optional();
