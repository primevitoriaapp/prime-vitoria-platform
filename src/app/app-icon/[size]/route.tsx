import { ImageResponse } from "next/og";
import { brandLogoDataUrl } from "@/lib/brand/brand-logo-data-url";

export const revalidate = 3600;

/** Ícones do app no tamanho exato que o celular pede (192 e 512; "maskable" com margem para recorte redondo). */
export async function GET(_req: Request, { params }: { params: Promise<{ size: string }> }) {
  const { size: raw } = await params;
  const maskable = raw.endsWith("-maskable");
  const size = Number(raw.replace("-maskable", "")) === 192 ? 192 : 512;
  const logo = await brandLogoDataUrl();
  const pad = maskable ? Math.round(size * 0.12) : 0;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0B0B0B" }}>
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" width={size - pad * 2} height={size - pad * 2} style={{ objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", color: "#C9A84C", fontSize: size * 0.22, fontWeight: 700, fontFamily: "serif" }}>PRIME</div>
        )}
      </div>
    ),
    { width: size, height: size }
  );
}
