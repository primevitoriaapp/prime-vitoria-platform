/**
 * Pacotes de noiva da R J Prime Transporte (valor é preenchido em cada orçamento).
 * Texto vai no orçamento do cliente; dá para editar no próprio serviço.
 */
/** route: nomes dos pontos do roteiro, na ordem (o 1º é a saída, o último o destino final). */
export type BridalPackage = { id: string; name: string; duration: string; destinations: string; extra?: string; hours?: number; route: string[] };

export const BRIDAL_INCLUDED = "Motorista profissional uniformizado, combustível, pedágios e seguro de passageiros.";

export const BRIDAL_PACKAGES: BridalPackage[] = [
  { id: "prime", name: "Pacote PRIME", duration: "até 2 horas", destinations: "1 destino à sua escolha", hours: 2, route: ["Salão / residência da noiva", "Igreja / cerimônia"] },
  { id: "prime_premium", name: "Pacote PRIME PREMIUM", duration: "duração a definir", destinations: "destinos a definir", route: ["Salão / residência da noiva", "Igreja / cerimônia"] },
  { id: "prime_elite", name: "Pacote PRIME ELITE", duration: "até 4 horas", destinations: "até 3 destinos à sua escolha", hours: 4, route: ["Salão de beleza", "Igreja / cerimônia", "Cerimonial / festa"] },
  {
    id: "prime_deluxe",
    name: "Pacote PRIME DELUXE",
    duration: "até 8 horas",
    destinations: "até 4 destinos à sua escolha",
    hours: 8,
    route: ["Salão / hotel / residência", "Igreja / cerimônia", "Cerimonial / festa", "Hotel / casa de núpcias"],
    extra: "Sugestão: busca da noiva no salão, hotel ou residência; transporte até a igreja; após a cerimônia, condução ao cerimonial; e, ao término da festa, transporte dos noivos ao hotel ou casa de núpcias."
  },
  { id: "prime_supreme", name: "Pacote PRIME SUPREME", duration: "até 10 horas", destinations: "inclui extensão no dia seguinte", hours: 10, route: ["Salão / hotel / residência", "Igreja / cerimônia", "Cerimonial / festa", "Hotel / casa de núpcias"] },
  { id: "carro_noivo", name: "CARRO DO NOIVO", duration: "duração a definir", destinations: "trajeto do noivo a combinar", route: ["Residência / hotel do noivo", "Igreja / cerimônia"] }
];

/** Texto do serviço no orçamento (cabe no limite de 500 caracteres). */
export function bridalDescription(p: BridalPackage): string {
  return [`👰 ${p.name} — ${p.duration} · ${p.destinations}.`, p.extra, `Incluso: ${BRIDAL_INCLUDED}`].filter(Boolean).join(" ").slice(0, 500);
}

export function bridalPackageById(id: string | null | undefined): BridalPackage | null {
  return BRIDAL_PACKAGES.find((p) => p.id === id) ?? null;
}
