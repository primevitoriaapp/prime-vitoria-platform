import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const PIN_PATTERN = /^\d{4}$/;

export function isValidDriverPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export function hashDriverPin(pin: string): string {
  if (!isValidDriverPin(pin)) {
    throw new Error("PIN deve ter exatamente 4 dígitos.");
  }
  const salt = randomBytes(16);
  const hash = scryptSync(pin, salt, 32);
  return `scrypt:${salt.toString("base64")}:${hash.toString("base64")}`;
}

export function verifyDriverPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !isValidDriverPin(pin)) return false;
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1]!, "base64");
  const expected = Buffer.from(parts[2]!, "base64");
  if (expected.length !== 32) return false;
  const actual = scryptSync(pin, salt, 32);
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(expected, actual);
}

/** Senha interna Supabase (nunca exposta ao motorista; só usada após validar PIN). */
export function deriveDriverAuthPassword(driverId: string): string {
  const pepper =
    process.env.DRIVER_AUTH_PEPPER?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()?.slice(0, 48) ||
    "prime-vitoria-driver-auth-dev";
  return createHash("sha256").update(`${pepper}:${driverId}`, "utf8").digest("base64url");
}
