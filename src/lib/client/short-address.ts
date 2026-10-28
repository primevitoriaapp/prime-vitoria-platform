const UF_NAMES = new Set(
  [
    "acre", "alagoas", "amapá", "amazonas", "bahia", "ceará", "distrito federal", "espírito santo", "goiás",
    "maranhão", "mato grosso", "mato grosso do sul", "minas gerais", "pará", "paraíba", "paraná", "pernambuco",
    "piauí", "rio de janeiro", "rio grande do norte", "rio grande do sul", "rondônia", "roraima",
    "santa catarina", "são paulo", "sergipe", "tocantins"
  ]
);

function isNoise(part: string): boolean {
  const p = part.trim().toLowerCase();
  if (!p) return true;
  if (p === "brasil" || p === "brazil") return true;
  if (p.startsWith("região ")) return true;
  if (p.startsWith("distrito ") && !p.startsWith("distrito federal")) return true;
  if (/^\d{5}-?\d{3}$/.test(p)) return true;
  if (/^região \d+/.test(p)) return true;
  if (/^microrregião|^mesorregião/.test(p)) return true;
  return false;
}

/**
 * Encurta endereços longos do mapa para leitura rápida.
 * "Aeroporto Internacional de Vitória - Eurico..., Rua X, Bairro, Distrito Goiabeiras, Vitória, Espírito Santo,
 *  Região Sudeste, 29070-010, Brasil" → "Aeroporto Internacional de Vitória - Eurico... · Vitória"
 */
export function shortAddress(raw: string | null | undefined): string {
  const text = (raw ?? "").trim();
  if (!text) return "";
  const parts = text.split(",").map((p) => p.trim()).filter((p) => !isNoise(p));
  if (parts.length <= 2) {
    const noState = parts.filter((p) => !UF_NAMES.has(p.toLowerCase()));
    return (noState.length ? noState : parts).join(", ");
  }

  // Cidade = a parte antes do estado (quando o estado aparece por extenso ou como "XX - ES").
  let city: string | null = null;
  const stateIdx = parts.findIndex((p) => UF_NAMES.has(p.toLowerCase()));
  if (stateIdx > 0) city = parts[stateIdx - 1];
  const lastWithUf = parts.find((p) => /\s-\s[A-Z]{2}$/.test(p));
  if (!city && lastWithUf) city = lastWithUf.replace(/\s-\s[A-Z]{2}$/, "");

  const head = [parts[0]];
  // Rua curta com número/bairro: inclui a segunda parte (ex.: "Avenida República, Centro").
  if (parts[0].length < 28 && parts[1] && parts[1] !== city && !UF_NAMES.has(parts[1].toLowerCase())) {
    head.push(parts[1]);
  }
  const headText = head.join(", ");
  if (city && !headText.toLowerCase().includes(city.toLowerCase())) return `${headText} · ${city}`;
  return headText;
}
