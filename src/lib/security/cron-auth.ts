/** Vercel Cron envia Authorization: Bearer <CRON_SECRET> quando configurado no projecto. */
export function isCronSecretAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return false;
  const auth = request.headers.get("authorization")?.trim();
  return auth === `Bearer ${secret}`;
}
