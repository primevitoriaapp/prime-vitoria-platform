import { isMachineBearerAuthorized } from "./machine-bearer-auth.ts";

/** Cron / worker: `Authorization: Bearer <DISPATCH_DIRECT_SCAN_SECRET>`. */
export function isDispatchDirectScanMachineRequest(request: Request): boolean {
  return isMachineBearerAuthorized(request, process.env.DISPATCH_DIRECT_SCAN_SECRET);
}
