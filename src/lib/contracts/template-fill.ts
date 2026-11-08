/** Preenche as variáveis {{...}} do modelo da ZapSign com os dados do cadastro (puro). */
export type FillSource = Record<string, string | null | undefined>;

const norm = (s: string) =>
  s
    .replace(/[{}]/g, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** Sinônimos: o nome da variável no modelo → chave dos nossos dados. */
const ALIASES: Record<string, string[]> = {
  NOME: ["NOME_COMPLETO", "NOME", "NOME_MOTORISTA", "CONTRATADA_NOME", "NOME_DO_MOTORISTA", "RAZAO_SOCIAL", "NOME_CLIENTE"],
  CPF: ["CPF", "CPF_MOTORISTA", "CONTRATADA_CPF"],
  CNPJ: ["CNPJ", "CNPJ_MEI", "CONTRATADA_CNPJ"],
  RG: ["RG"],
  ENDERECO: ["ENDERECO", "ENDERECO_COMPLETO", "ENDERECO_MOTORISTA"],
  CEP: ["CEP"],
  CIDADE: ["CIDADE", "MUNICIPIO"],
  UF: ["UF", "ESTADO"],
  EMAIL: ["EMAIL", "E_MAIL", "EMAIL_SIGNATARIO", "SIGNER_EMAIL"],
  TELEFONE: ["TELEFONE", "CELULAR", "WHATSAPP", "FONE"],
  CNH: ["CNH", "CNH_NUMERO", "NUMERO_CNH", "REGISTRO_CNH"],
  CNH_CATEGORIA: ["CNH_CATEGORIA", "CATEGORIA_CNH"],
  CNH_VALIDADE: ["CNH_VALIDADE", "VALIDADE_CNH"],
  NASCIMENTO: ["DATA_NASCIMENTO", "NASCIMENTO"],
  VEICULO: ["VEICULO", "MARCA_MODELO", "MODELO", "VEICULO_MODELO", "VEICULO_MARCA_MODELO"],
  PLACA: ["PLACA", "VEICULO_PLACA"],
  ANO: ["ANO", "ANO_MODELO", "VEICULO_ANO"],
  COR: ["COR", "VEICULO_COR"],
  DATA: ["DATA", "DATA_ASSINATURA", "DATA_CONTRATO", "DATA_HOJE"]
};

export function guessValue(variable: string, src: FillSource): string {
  const v = norm(variable);
  for (const [key, names] of Object.entries(ALIASES)) {
    if (names.includes(v)) return String(src[key] ?? "");
  }
  return String(src[v] ?? "");
}

export function fillTemplate(variables: string[], src: FillSource): { variable: string; value: string }[] {
  return variables.map((variable) => ({ variable, value: guessValue(variable, src) }));
}
