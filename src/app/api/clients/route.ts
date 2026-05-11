import { z } from "zod";
import { db } from "@/lib/server/db";
import { fail, mapApiError, ok } from "@/lib/server/http";
import { getSessionContext } from "@/lib/server/session";
import { assertCapability } from "@/lib/security/rbac";

const schema = z.object({
  type: z.enum(["PF", "PJ"]),
  name: z.string().min(2),
  document: z.string().optional(),
  email: z.string().email().optional(),
  phone: z.string().optional()
});

export async function POST(request: Request) {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.write");
    const body = schema.parse(await request.json());
    const { data, error } = await db.from("clients").insert(body).select("*").single();
    if (error) return fail("CLIENT_CREATE_FAILED", error.message, 500);
    return ok(data, 201);
  } catch (error) {
    return mapApiError(error);
  }
}

export async function GET() {
  try {
    const session = await getSessionContext();
    assertCapability(session, "client.read");
    const { data, error } = await db.from("clients").select("*").eq("active", true).limit(200);
    if (error) return fail("CLIENT_LIST_FAILED", error.message, 500);
    return ok(data ?? []);
  } catch (error) {
    return mapApiError(error);
  }
}
