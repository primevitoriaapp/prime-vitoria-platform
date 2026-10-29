import { randomBytes } from "node:crypto";
import { db } from "@/lib/server/db";
import { publicAppUrl } from "@/lib/messages/trip-message-context";

/** Link público do orçamento (o cliente abre sem login). */
export async function quoteShareLink(quoteId: string, current: string | null | undefined): Promise<string> {
  let token = current ?? null;
  if (!token) {
    token = randomBytes(18).toString("base64url");
    await db.from("quotes").update({ share_token: token }).eq("id", quoteId);
  }
  return `${publicAppUrl()}/orcamento/${quoteId}?t=${encodeURIComponent(token)}`;
}
