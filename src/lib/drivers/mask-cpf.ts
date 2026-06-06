/** Exibe CPF mascarado (últimos 2 dígitos visíveis). */
export function maskCpfDigits(cpf: string): string {
  const digits = cpf.replace(/\D/g, "");
  if (digits.length !== 11) return "***.***.***-**";
  return `***.***.${digits.slice(6, 9)}-${digits.slice(9)}`;
}
