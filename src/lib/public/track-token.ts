/** Token opaco gerado com `randomBytes(32).toString("base64url")`. */
const TRACK_TOKEN_RE = /^[A-Za-z0-9_-]{16,200}$/;

export function normalizePublicTrackToken(raw: string): string | null {
  let token: string;
  try {
    token = decodeURIComponent(raw).trim();
  } catch {
    return null;
  }
  if (!TRACK_TOKEN_RE.test(token)) return null;
  return token;
}
