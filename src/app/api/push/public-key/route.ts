import { mapApiError, ok } from "@/lib/server/http";
import { getVapidKeys } from "@/lib/push/web-push";

export const dynamic = "force-dynamic";

/** Chave pública para o navegador assinar os avisos. */
export async function GET() {
  try {
    const keys = await getVapidKeys();
    return ok({ publicKey: keys.publicKey });
  } catch (error) {
    return mapApiError(error);
  }
}
