import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
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
        <div style={{ fontSize: 120, fontWeight: 700, letterSpacing: "0.06em", fontFamily: "serif", display: "flex" }}>PRIME</div>
        <div style={{ width: "46%", height: 4, background: "#C9A84C", marginTop: 12, display: "flex" }} />
        <div style={{ fontSize: 44, letterSpacing: "0.3em", marginTop: 12, color: "#E8D9A8", display: "flex" }}>VITÓRIA</div>
      </div>
    ),
    { ...size }
  );
}
