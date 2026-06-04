import { NextResponse } from "next/server";
import { buildStagingStatusPayload } from "@/lib/server/staging-status";

/** Diagnóstico P1/staging sem expor secrets. */
export async function GET() {
  const payload = await buildStagingStatusPayload();
  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
