/**
 * Avaliações do perfil da Prime no Google (Places API New).
 * Guardadas em cache por 12 horas: poucas consultas por mês, dentro da cota gratuita.
 */
const PLACE_ID = "ChIJNUgr8GYXuAAR894bMX1AjEM";

export type GoogleReview = {
  author: string;
  photo: string | null;
  rating: number;
  text: string;
  when: string;
  uri: string | null;
};

export type GoogleReviewsData = { rating: number | null; total: number | null; reviews: GoogleReview[] };

type ApiReview = {
  rating?: number;
  relativePublishTimeDescription?: string;
  text?: { text?: string };
  originalText?: { text?: string };
  authorAttribution?: { displayName?: string; photoUri?: string; uri?: string };
  googleMapsUri?: string;
};

export async function loadGoogleReviews(lang: "pt" | "en" | "es"): Promise<GoogleReviewsData | null> {
  const key = (process.env.GOOGLE_PLACES_REVIEWS_KEY ?? process.env.GOOGLE_MAPS_API_KEY)?.trim();
  if (!key) return null;
  const languageCode = lang === "pt" ? "pt-BR" : lang;
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${PLACE_ID}?languageCode=${languageCode}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount,reviews" },
      next: { revalidate: 43_200 },
      signal: AbortSignal.timeout(6_000)
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { rating?: number; userRatingCount?: number; reviews?: ApiReview[] };
    const reviews = (j.reviews ?? [])
      .filter((r) => (r.rating ?? 0) >= 4 && (r.text?.text ?? r.originalText?.text ?? "").trim().length > 0)
      .map((r) => ({
        author: r.authorAttribution?.displayName ?? "Google",
        photo: r.authorAttribution?.photoUri ?? null,
        rating: r.rating ?? 5,
        text: (r.text?.text ?? r.originalText?.text ?? "").trim(),
        when: r.relativePublishTimeDescription ?? "",
        uri: r.googleMapsUri ?? r.authorAttribution?.uri ?? null
      }));
    return { rating: j.rating ?? null, total: j.userRatingCount ?? null, reviews };
  } catch {
    return null;
  }
}
