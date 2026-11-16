/** Cadastro completo do motorista (etapa 2): arquivos pedidos e regras. Mesmas perguntas do antigo Google Formulário. */

export type SignupFileKind =
  | "cnh"
  | "comprovante_residencia"
  | "crlv"
  | "foto_dianteira"
  | "foto_traseira"
  | "foto_lateral_esquerda"
  | "foto_lateral_direita"
  | "apolice_seguro"
  | "antecedentes";

export const SIGNUP_FILES: { kind: SignupFileKind; label: string; accept: string; required: boolean; hint?: string }[] = [
  { kind: "cnh", label: "Foto ou PDF da CNH (frente e verso)", accept: "image/*,application/pdf", required: true },
  { kind: "comprovante_residencia", label: "Comprovante de residência", accept: "image/*,application/pdf", required: true, hint: "Conta de luz, água ou telefone dos últimos 3 meses" },
  { kind: "antecedentes", label: "Certidão de antecedentes criminais", accept: "image/*,application/pdf", required: true },
  { kind: "crlv", label: "CRLV do veículo (PDF)", accept: "application/pdf,image/*", required: true },
  { kind: "foto_dianteira", label: "Foto da frente do veículo", accept: "image/*", required: true },
  { kind: "foto_traseira", label: "Foto da traseira do veículo", accept: "image/*", required: true },
  { kind: "foto_lateral_esquerda", label: "Foto da lateral esquerda", accept: "image/*", required: true },
  { kind: "foto_lateral_direita", label: "Foto da lateral direita", accept: "image/*", required: true },
  { kind: "apolice_seguro", label: "Apólice do seguro (PDF)", accept: "application/pdf,image/*", required: false }
];

export const SIGNUP_FILE_KINDS = new Set<string>(SIGNUP_FILES.map((f) => f.kind));

export const CNH_CATEGORIES = ["A", "B", "C", "D", "E", "AB", "AC", "AD", "AE"];
export const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
export const LANGS = ["Português", "Inglês", "Espanhol"];
export const SERVICES = ["Transfer aeroporto", "Executivo / corporativo", "Carro à disposição", "Eventos", "Casamentos", "Offshore e portos", "Turismo", "Rotas de funcionários"];
export const EXPERIENCE_TIME = ["Menos de 1 ano", "1 a 3 anos", "3 a 5 anos", "Mais de 5 anos"];
export const PIX_TYPES = ["CPF", "CNPJ", "E-mail", "Telefone", "Chave aleatória"];

export const DECLARATIONS = [
  { key: "dados", label: "Li e concordo com o tratamento dos meus dados pessoais para as finalidades descritas acima." },
  { key: "verdade", label: "Declaro que as informações e os documentos fornecidos são verdadeiros, completos e atualizados." },
  { key: "vinculo", label: "Estou ciente de que o envio deste cadastro não cria vínculo empregatício, não garante contratação e não assegura quantidade mínima de serviços." },
  { key: "documentos", label: "Autorizo a Prime Vitória a armazenar cópias dos documentos enviados neste cadastro, incluindo CNH, CRLV, comprovante de residência, certidão de antecedentes criminais e apólices de seguro, para fins de análise cadastral, formalização contratual, controle documental e operação dos serviços." }
] as const;

export const onlyDigits = (s: unknown) => String(s ?? "").replace(/\D/g, "");

/** Confere o dígito do CPF. */
export function validCpf(raw: unknown): boolean {
  const c = onlyDigits(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (n: number) => {
    let s = 0;
    for (let i = 0; i < n; i++) s += Number(c[i]) * (n + 1 - i);
    const r = (s * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(9) === Number(c[9]) && dv(10) === Number(c[10]);
}
