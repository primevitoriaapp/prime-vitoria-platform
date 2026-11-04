import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://primevitoria.com";
  const languages = { "pt-BR": `${base}/`, en: `${base}/en`, es: `${base}/es` };
  return [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1, alternates: { languages } },
    { url: `${base}/en`, changeFrequency: "monthly", priority: 0.7, alternates: { languages } },
    { url: `${base}/es`, changeFrequency: "monthly", priority: 0.7, alternates: { languages } }
  ];
}
