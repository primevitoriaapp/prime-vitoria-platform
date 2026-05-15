import { NextResponse } from "next/server";

/** Smoke test / uptime (sem dependência de Supabase). */
export async function GET() {
  return NextResponse.json(
    { ok: true, service: "prime-vitoria-platform", time: new Date().toISOString() },
    { status: 200 }
  );
}
