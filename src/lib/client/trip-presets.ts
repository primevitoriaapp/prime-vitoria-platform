export type ClientTripPreset = {
  id: string;
  label: string;
  origin: string;
  destination: string;
  serviceType?: string;
};

const MAX_PRESETS = 6;

function storageKey(clientId: string) {
  return `pv-client-trip-presets:${clientId}`;
}

export function loadTripPresets(clientId: string): ClientTripPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(clientId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is ClientTripPreset =>
        p != null &&
        typeof p === "object" &&
        typeof (p as ClientTripPreset).id === "string" &&
        typeof (p as ClientTripPreset).label === "string" &&
        typeof (p as ClientTripPreset).origin === "string" &&
        typeof (p as ClientTripPreset).destination === "string"
    );
  } catch {
    return [];
  }
}

export function saveTripPresets(clientId: string, presets: ClientTripPreset[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(storageKey(clientId), JSON.stringify(presets.slice(0, MAX_PRESETS)));
}

export function upsertTripPreset(
  clientId: string,
  input: Omit<ClientTripPreset, "id"> & { id?: string }
): ClientTripPreset[] {
  const presets = loadTripPresets(clientId);
  const id = input.id ?? crypto.randomUUID();
  const next: ClientTripPreset = {
    id,
    label: input.label.trim() || "Rota favorita",
    origin: input.origin.trim(),
    destination: input.destination.trim(),
    serviceType: input.serviceType?.trim() || undefined
  };
  const without = presets.filter((p) => p.id !== id);
  const merged = [next, ...without].slice(0, MAX_PRESETS);
  saveTripPresets(clientId, merged);
  return merged;
}

export function removeTripPreset(clientId: string, presetId: string): ClientTripPreset[] {
  const merged = loadTripPresets(clientId).filter((p) => p.id !== presetId);
  saveTripPresets(clientId, merged);
  return merged;
}
