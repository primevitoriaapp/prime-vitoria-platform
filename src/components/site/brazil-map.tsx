/** Mapa estilizado do Brasil com alfinetes nas cidades atendidas. */

// Contorno simplificado do Brasil (longitude, latitude).
const OUTLINE: [number, number][] = [
  [-51.6, 4.4], [-50.4, 2.2], [-49.9, 0.3], [-48.4, -0.9], [-46.5, -1.0], [-44.3, -2.5], [-41.8, -2.9], [-38.5, -3.7],
  [-37.0, -4.9], [-35.2, -5.4], [-34.8, -7.1], [-35.0, -8.4], [-35.7, -9.7], [-37.1, -11.0], [-38.5, -13.0], [-39.0, -14.8],
  [-39.2, -17.7], [-40.2, -20.0], [-41.0, -22.0], [-42.0, -22.9], [-43.2, -23.0], [-44.7, -23.4], [-46.3, -24.0], [-48.0, -25.3],
  [-48.5, -26.5], [-48.6, -28.3], [-49.7, -29.3], [-50.8, -31.0], [-52.1, -32.2], [-53.4, -33.7], [-53.6, -32.5], [-55.4, -31.0],
  [-57.6, -30.2], [-55.8, -28.2], [-53.8, -27.1], [-54.6, -25.6], [-54.3, -24.0], [-55.6, -22.6], [-57.9, -22.1], [-58.2, -20.0],
  [-57.6, -18.0], [-58.4, -16.3], [-60.2, -16.2], [-60.4, -13.5], [-61.9, -13.4], [-65.3, -10.8], [-66.6, -9.9], [-68.6, -11.0],
  [-70.6, -11.0], [-70.6, -9.5], [-72.2, -10.0], [-73.6, -9.4], [-73.9, -7.4], [-73.0, -5.0], [-70.0, -4.2], [-69.4, -1.1],
  [-69.9, 1.0], [-67.3, 1.8], [-66.0, 0.8], [-64.0, 1.5], [-63.4, 2.2], [-64.8, 4.0], [-61.0, 4.5], [-60.6, 5.2], [-59.8, 4.2],
  [-59.6, 1.5], [-56.5, 1.9], [-54.0, 2.2], [-52.5, 2.4]
];

const K = 10;
const px = (lng: number) => (lng + 75) * K;
const py = (lat: number) => (6 - lat) * K;

export type MapCity = { name: string; lat: number; lng: number; hq?: boolean };

export const MAP_CITIES: MapCity[] = [
  { name: "Vitória", lat: -20.32, lng: -40.34, hq: true },
  { name: "São Paulo", lat: -23.55, lng: -46.63 },
  { name: "Rio de Janeiro", lat: -22.91, lng: -43.2 },
  { name: "Belo Horizonte", lat: -19.92, lng: -43.94 },
  { name: "Salvador", lat: -12.97, lng: -38.5 },
  { name: "Recife", lat: -8.05, lng: -34.88 }
];

export function BrazilMap({ sedeLabel }: { sedeLabel: string }) {
  const d = OUTLINE.map(([lng, lat], i) => `${i ? "L" : "M"}${px(lng).toFixed(0)} ${py(lat).toFixed(0)}`).join(" ") + "Z";
  const hq = MAP_CITIES.find((c) => c.hq)!;
  return (
    <svg viewBox="0 0 480 410" className="h-auto w-full" role="img" aria-label="Mapa do Brasil com as cidades atendidas">
      <path d={d} fill="#EFEADF" stroke="#D9CFB8" strokeWidth="2" strokeLinejoin="round" />
      {/* Linhas saindo de Vitória */}
      {MAP_CITIES.filter((c) => !c.hq).map((c) => (
        <line key={`l-${c.name}`} x1={px(hq.lng)} y1={py(hq.lat)} x2={px(c.lng)} y2={py(c.lat)} stroke="#C9A84C" strokeWidth="1.3" strokeDasharray="3 4" opacity="0.7" />
      ))}
      {MAP_CITIES.map((c) => {
        const x = px(c.lng);
        const y = py(c.lat);
        const left = c.name === "São Paulo" || c.name === "Belo Horizonte";
        return (
          <g key={c.name}>
            {c.hq ? <circle cx={x} cy={y} r="16" fill="#C9A84C" opacity="0.18" /> : null}
            <circle cx={x} cy={y} r={c.hq ? 7 : 5} fill={c.hq ? "#111" : "#C9A84C"} stroke="#fff" strokeWidth="2" />
            <text
              x={left ? x - 10 : x + 11}
              y={y + 4}
              textAnchor={left ? "end" : "start"}
              fontSize={c.hq ? 14 : 12}
              fontWeight={c.hq ? 700 : 500}
              fill="#111"
              style={{ fontFamily: "inherit" }}
            >
              {c.name}
              {c.hq ? ` · ${sedeLabel}` : ""}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
