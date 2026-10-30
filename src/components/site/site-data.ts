const IMG = "https://tcpgmndarqxwfnonzurl.supabase.co/storage/v1/object/public/site-assets/site";

/** Dados do site institucional (contatos, links e imagens) num lugar só. */
export const SITE = {
  phone: "+55 (27) 2142-8307",
  phoneHref: "tel:+552721428307",
  mobile: "+55 (27) 99806-3956",
  whatsapp: "https://wa.me/5527998063956?text=Ol%C3%A1%2C%20vim%20pelo%20site%20da%20Prime%20Vit%C3%B3ria.",
  email: "contato@primevitoria.com",
  instagram: "https://instagram.com/primevitoria",
  address: "Rua Amélia da Cunha Ornellas, 89 · Bento Ferreira · Vitória/ES · 29050-620",
  links: {
    agendar: "/pedir",
    empresa: "/login?next=/client"
  },
  img: {
    hero: `${IMG}/ponte-vitoria.webp`,
    heroMobile: `${IMG}/ponte-vitoria-mobile.webp`,
    logo: `${IMG}/logo-prime.webp`,
    sedan: `${IMG}/sedan.webp`,
    suv: `${IMG}/suv.webp`,
    van: `${IMG}/van.webp`,
    aeroporto: `${IMG}/aeroporto.webp`
  }
} as const;
