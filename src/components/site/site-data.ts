const IMG = "https://tcpgmndarqxwfnonzurl.supabase.co/storage/v1/object/public/site-assets/site";

/** Dados do site institucional (contatos, links e imagens) num lugar só. */
export const SITE = {
  phone: "+55 (27) 2142-8307",
  phoneHref: "tel:+552721428307",
  mobile: "+55 (27) 99806-3956",
  whatsapp: "https://wa.me/5527998063956?text=Ol%C3%A1%2C%20vim%20pelo%20site%20da%20Prime%20Vit%C3%B3ria.",
  email: "contato@primevitoria.com",
  instagram: "https://instagram.com/primevitoria",
  /** Redes sociais no rodapé. Só aparecem as que tiverem link. */
  social: {
    instagram: "https://instagram.com/primevitoria",
    facebook: "",
    linkedin: "",
    tiktok: "",
    youtube: ""
  },
  address: "Rua Amélia da Cunha Ornellas, 89 · Bento Ferreira · Vitória/ES · 29050-620",
  links: {
    agendar: "/pedir",
    empresa: "/login?next=/client"
  },
  google: {
    reviews: "https://www.google.com/maps/place/?q=place_id:ChIJNUgr8GYXuAAR894bMX1AjEM",
    write: "https://search.google.com/local/writereview?placeid=ChIJNUgr8GYXuAAR894bMX1AjEM"
  },
  /** Formulário de cadastro de motorista parceiro (Google Forms). Vazio = usa o WhatsApp. */
  parceiroForm: "",
  /** Fotos reais da frota em operação (preencher quando chegarem). A seção só aparece com fotos. */
  operacao: [] as { src: string; alt: string }[],
  /** Logos de clientes (só com autorização). A faixa só aparece com logos. */
  clientes: [] as { src: string; name: string }[],
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
