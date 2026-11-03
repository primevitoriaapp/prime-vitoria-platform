/** Transforma os itens do voucher em corridas para a agenda (o usuário confere e edita antes de criar). Funções puras. */
import type { ParsedVoucher, VoucherItem } from "./voucher-types.ts";

export type VoucherLeg = {
  key: string;
  /** Referência que vai na O.S. da corrida (ex.: NR263701-A ou NR263701-E2). */
  ref: string;
  include: boolean;
  date: string;
  time: string;
  origin: string;
  destination: string;
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  flight: string;
  categoryId: string;
  vehicleType: string;
  clientAmount: string;
  driverAmount: string;
  notes: string;
  /** Texto curto explicando de onde veio (ex.: "Parte 2 de 2 do veículo disponível 5h"). */
  label: string;
};

type Cat = { id: string; name: string; kind: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "CARRO EXECUTIVO" → categoria Executivo; "VAN" → van; "SUV"/"BLINDADO" → Premium; etc. */
export function matchCategory(vehicleType: string, cats: Cat[]): string {
  const t = norm(vehicleType);
  const find = (pred: (c: Cat) => boolean) => cats.find(pred)?.id ?? "";
  if (/onibus|micro/.test(t)) return find((c) => c.kind === "onibus");
  if (/\bvan\b|sprinter/.test(t)) return find((c) => c.kind === "van") || find((c) => norm(c.name).includes("van"));
  if (/suv|premium|blind/.test(t)) return find((c) => norm(c.name).includes("premium"));
  if (/execut/.test(t)) return find((c) => c.kind === "carro" && norm(c.name).includes("execut"));
  if (/econ|essencial|compact|basic/.test(t)) return find((c) => norm(c.name).includes("essencial"));
  return find((c) => c.kind === "carro" && norm(c.name).includes("execut")) || find((c) => c.kind === "carro");
}

export function addHours(date: string, time: string, hours: number): { date: string; time: string } {
  const [h, m] = time.split(":").map(Number);
  const base = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m);
  const d = new Date(base + hours * 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return { date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}

const money = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

function baseLeg(v: ParsedVoucher, it: VoucherItem, cats: Cat[]): Omit<VoucherLeg, "key" | "ref" | "origin" | "destination" | "notes" | "label" | "clientAmount" | "date" | "time"> {
  const pax = it.passengers[0];
  return {
    include: true,
    passengerName: it.passengers.map((p) => p.name).join(", "),
    passengerPhone: pax?.phone ?? "",
    passengerCount: Math.max(1, it.passengers.length),
    flight: it.flight ?? "",
    categoryId: matchCategory(it.vehicleType, cats),
    vehicleType: it.vehicleType,
    driverAmount: ""
  };
}

export function voucherToLegs(v: ParsedVoucher, cats: Cat[]): VoucherLeg[] {
  const legs: VoucherLeg[] = [];
  const head = `Voucher ${v.issuerName} ${v.number}`;
  for (const it of v.items) {
    const ref = `${v.number}-${it.letter}`;
    const extra = [it.originNote, it.destinationNote].filter(Boolean).join(" ");
    if (it.kind === "disponivel" && it.hours) {
      const stop = it.stopPlace || it.destination || "Local do evento (confirmar)";
      const back = addHours(it.date, it.time, it.hours);
      legs.push({
        ...baseLeg(v, it, cats),
        key: `${ref}-1`,
        ref: `${ref}1`,
        date: it.date,
        time: it.time,
        origin: it.origin,
        destination: stop,
        clientAmount: money(it.amount),
        notes: [`${head} item ${it.letter}: veículo disponível ${it.hours}h${it.km ? ` (${it.km} km)` : ""}. Ida até o evento.`, extra].filter(Boolean).join("\n"),
        label: `Parte 1 de 2 do veículo disponível ${it.hours}h (o cliente paga a diária aqui)`
      });
      legs.push({
        ...baseLeg(v, it, cats),
        key: `${ref}-2`,
        ref: `${ref}2`,
        date: back.date,
        time: back.time,
        origin: stop,
        destination: it.origin,
        clientAmount: "0",
        notes: `${head} item ${it.letter}: retorno após o evento (parte da diária de ${it.hours}h). Confirmar o horário com o passageiro.`,
        label: `Parte 2 de 2: volta. Horário estimado (início + ${it.hours}h), ajuste se precisar`
      });
      continue;
    }
    legs.push({
      ...baseLeg(v, it, cats),
      key: ref,
      ref,
      date: it.date,
      time: it.time,
      origin: it.origin,
      destination: it.destination,
      clientAmount: money(it.amount),
      notes: [`${head} item ${it.letter}: ${it.service}.`, extra].filter(Boolean).join("\n"),
      label: it.service
    });
  }
  return legs;
}
