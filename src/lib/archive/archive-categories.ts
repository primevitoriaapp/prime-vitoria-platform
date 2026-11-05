/** Pastas do arquivo de backups. */
export const ARCHIVE_CATEGORIES = {
  omie_clientes: "Omie · Clientes e fornecedores",
  omie_orcamentos: "Omie · Orçamentos e pedidos",
  omie_receber: "Omie · Contas a receber",
  omie_pagar: "Omie · Contas a pagar",
  omie_outros: "Omie · Outros relatórios",
  notas_fiscais: "Notas fiscais emitidas (XML/PDF)",
  extratos_antigos: "Extratos bancários antigos",
  contratos: "Contratos e documentos",
  outros: "Outros"
} as const;
export type ArchiveCategory = keyof typeof ARCHIVE_CATEGORIES;
