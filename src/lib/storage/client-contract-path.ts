const PREFIX = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/.+\.pdf$/i;

export function isClientContractStoragePath(path: string | null | undefined): boolean {
  const raw = path?.trim();
  if (!raw) return false;
  return PREFIX.test(raw);
}
