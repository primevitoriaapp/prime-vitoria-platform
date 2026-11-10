/** Documentos da ficha do motorista (ordem da tela). */
export type DriverDocKind =
  | "cnh"
  | "comprovante_residencia"
  | "antecedentes"
  | "seguro"
  | "crlv"
  | "foto_frente"
  | "foto_lateral_esq"
  | "foto_lateral_dir"
  | "foto_traseira"
  | "foto_interior";

export const DRIVER_DOC_KINDS: { kind: DriverDocKind; label: string; group: "pessoal" | "veiculo" | "fotos"; validity?: boolean; optional?: boolean; hint?: string }[] = [
  { kind: "cnh", label: "CNH (frente e verso)", group: "pessoal" },
  { kind: "comprovante_residencia", label: "Comprovante de residência", group: "pessoal" },
  { kind: "antecedentes", label: "Certidão de antecedentes criminais", group: "pessoal", validity: true, hint: "Emitida pela Polícia Federal ou Civil. Coloque a validade (normalmente 90 dias)." },
  { kind: "crlv", label: "Documento do veículo (CRLV)", group: "veiculo" },
  { kind: "seguro", label: "Apólice do seguro", group: "veiculo", validity: true, optional: true },
  { kind: "foto_frente", label: "Frente", group: "fotos" },
  { kind: "foto_lateral_esq", label: "Lateral esquerda", group: "fotos" },
  { kind: "foto_lateral_dir", label: "Lateral direita", group: "fotos" },
  { kind: "foto_traseira", label: "Traseira", group: "fotos" },
  { kind: "foto_interior", label: "Interior", group: "fotos" }
];

export const DRIVER_DOC_KIND_SET = new Set<string>(DRIVER_DOC_KINDS.map((k) => k.kind));
