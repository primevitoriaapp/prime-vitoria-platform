import { NextResponse } from "next/server";
import { buildHealthPayload } from "@/lib/server/health-check.ts";

/** Smoke test / uptime. `?detailed=1` expõe flags de config (sem segredos). */
export async function GET(request: Request) {
  const detailed = new URL(request.url).searchParams.get("detailed") === "1";
  const payload = buildHealthPayload(detailed);
  return NextResponse.json(payload, { status: payload.ok ? 200 : 503 });
}
