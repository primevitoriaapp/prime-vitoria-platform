/**
 * URL base para chamadas server-side à própria API (RSC).
 * Em Vercel Preview, `NEXT_PUBLIC_BASE_URL` pode apontar para produção — usar `VERCEL_URL`.
 */
export function resolveAppBaseUrl(): string {
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return `https://${host}`;
  }
  const configured = process.env.NEXT_PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return "http://localhost:3000";
}
