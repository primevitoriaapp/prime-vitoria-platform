/** Telefones no texto viram link (toque para ligar) — ex.: cerimonialista do casamento. */
export function linkPhones(text: string) {
  const re = /(\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4})/g;
  return text.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={`tel:${part.replace(/\D/g, "")}`} className="font-semibold text-[#8A6D1F] underline">
        {part}
      </a>
    ) : (
      part
    )
  );
}
