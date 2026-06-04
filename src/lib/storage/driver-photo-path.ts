export function isDriverPhotoStoragePath(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  return !value.startsWith("http://") && !value.startsWith("https://");
}
