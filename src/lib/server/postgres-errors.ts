/** Detecta violacao de unique do Postgres (Supabase/PostgREST). */
export function isPostgresUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: string; message?: string };
  if (e.code === "23505") return true;
  const m = String(e.message ?? "");
  return /duplicate key|unique constraint/i.test(m);
}
