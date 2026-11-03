/** Palavra do PDF com posição (x da esquerda, y de cima para baixo, na linha de base). */
export type PdfWord = { page: number; x: number; y: number; text: string };

export type VoucherItem = {
  /** Letra do item no voucher (A, B, E…). */
  letter: string;
  date: string; // AAAA-MM-DD
  time: string; // HH:MM
  city: string;
  service: string;
  kind: "transfer" | "disponivel";
  hours: number | null;
  km: number | null;
  serviceNotes: string;
  origin: string;
  originNote: string;
  destination: string;
  destinationNote: string;
  passengers: { name: string; phone: string | null }[];
  requesters: string[];
  vehicleType: string;
  amount: number | null;
  flight: string | null;
  /** Para "veículo disponível": o local do evento, quando o voucher diz para onde seguir. */
  stopPlace: string | null;
};

export type ParsedVoucher = {
  format: "cep";
  number: string;
  event: string;
  requestedBy: string | null;
  issuerCnpj: string | null;
  issuerName: string;
  items: VoucherItem[];
};
