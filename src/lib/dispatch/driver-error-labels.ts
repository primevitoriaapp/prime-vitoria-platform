import { attachProfileNamesToDrivers } from "@/lib/vehicles/driver-default-vehicle";

type DriverRow = { id: string; cpf?: string; profile_name?: string | null };

export function driverDisplayLabel(driver: {
  profile_name?: string | null;
  cpf?: string;
}): string {
  return driver.profile_name?.trim() || (driver.cpf ? `CPF ${driver.cpf}` : "Motorista");
}

export async function driverDisplayNameByIds(
  drivers: Array<{ id: string; cpf?: string; profile_id?: string | null }>
): Promise<Map<string, string>> {
  const withNames = await attachProfileNamesToDrivers(drivers);
  return new Map(
    withNames.map((d) => [d.id as string, driverDisplayLabel(d as DriverRow)])
  );
}
