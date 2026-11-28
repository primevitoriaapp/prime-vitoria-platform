import { db } from "@/lib/server/db";

/**
 * O motorista acabou de assinar o contrato: libera as corridas (se estava travado)
 * e avisa a central (sininho + notificação no celular) e o próprio motorista.
 */
export async function onDriverSignedContract(tenantId: string, driverId: string, title: string): Promise<void> {
  const { data: d } = await db.from("drivers").select("full_name, contract_required").eq("id", driverId).maybeSingle();
  const name = String(d?.full_name ?? "Motorista");
  const wasBlocked = Boolean(d?.contract_required);
  if (wasBlocked) await db.from("drivers").update({ contract_required: false }).eq("id", driverId);

  const staffTitle = `✍️ ${name.split(" ")[0]} assinou o contrato`;
  const staffBody = wasBlocked
    ? `${name} assinou "${title}". Já pode aceitar corridas. Confira se falta a assinatura da Prime/testemunhas.`
    : `${name} assinou "${title}". Confira se falta a assinatura da Prime/testemunhas.`;
  const { pushToStaff, pushToDriver } = await import("@/lib/push/web-push");
  await pushToStaff(tenantId, { title: staffTitle, body: staffBody, url: `/drivers?ficha=${driverId}&contrato=1`, tag: `contract-${driverId}` }).catch(() => 0);
  await import("@/lib/notifications/enqueue-for-profiles")
    .then(({ enqueueInAppForTenantRoles }) => enqueueInAppForTenantRoles(tenantId, ["admin", "operador"], { eventType: "drivers.contract_signed", title: staffTitle, body: staffBody }))
    .catch(() => 0);
  if (wasBlocked)
    await pushToDriver(tenantId, driverId, { title: "Contrato assinado ✅", body: "Tudo certo! Você já pode aceitar corridas da Prime Vitória.", url: "/driver", tag: `contract-${driverId}` }).catch(() => 0);
}
