import { ImageResponse } from "next/og";
import { brandLogoDataUrl } from "@/lib/brand/brand-logo-data-url";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export const revalidate = 3600;

export default async function AppleIcon() {
  // Usa a logo cadastrada em Configurações; sem logo, desenha "PRIME VITÓRIA".
  const logo = await brandLogoDataUrl();
  if (logo) {
    return new ImageResponse(
      (
        <div style={{ width: "100%", height: "100%", display: "flex", background: "#0B0B0B" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={180} height={180} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ),
      { ...size }
    );
  }
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #1a1a1a 0%, #050505 100%)",
          color: "#C9A84C"
        }}
      >
        <div style={{ fontSize: 42, fontWeight: 700, letterSpacing: "0.06em", fontFamily: "serif", display: "flex" }}>PRIME</div>
        <div style={{ width: "46%", height: 2, background: "#C9A84C", marginTop: 4, display: "flex" }} />
        <div style={{ fontSize: 16, letterSpacing: "0.3em", marginTop: 4, color: "#E8D9A8", display: "flex" }}>VITÓRIA</div>
      </div>
    ),
    { ...size }
  );
}
