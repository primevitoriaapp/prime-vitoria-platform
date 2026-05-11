import { isMachineBearerAuthorized } from "./machine-bearer-auth.ts";

/**
 * Chamadas de maquina (cron): `Authorization: Bearer <ERP_JOB_PROCESS_SECRET>`.
 */
export function isErpJobProcessMachineRequest(request: Request): boolean {
  return isMachineBearerAuthorized(request, process.env.ERP_JOB_PROCESS_SECRET);
}
