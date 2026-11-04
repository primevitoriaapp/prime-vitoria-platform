import type { MetadataRoute } from "next";

/** Só o site institucional entra no Google; painel, app e portal ficam de fora. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/en", "/es"],
        disallow: ["/api/", "/dashboard", "/agenda", "/driver", "/client", "/login", "/voucher", "/fatura", "/orcamento", "/r/", "/pedir", "/p1-homologacao", "/staging-status", "/redefinir-senha"]
      }
    ],
    sitemap: "https://primevitoria.com/sitemap.xml"
  };
}
