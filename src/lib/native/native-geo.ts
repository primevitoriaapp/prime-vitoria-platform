"use client";

/**
 * GPS em segundo plano no app instalado (Android/iPhone via Capacitor).
 * No navegador comum isto devolve null e o app usa o GPS do navegador como antes.
 * Usa a ponte nativa que o app injeta na página (não precisa de pacote no site).
 */
type NativeLocation = { latitude: number; longitude: number; accuracy?: number; time?: number | null };
type NativeError = { code?: string; message?: string };
type CapBridge = {
  isNativePlatform?: () => boolean;
  nativeCallback?: (plugin: string, method: string, options: unknown, cb: (data: unknown, err?: unknown) => void) => string;
  nativePromise?: (plugin: string, method: string, options?: unknown) => Promise<unknown>;
};

function cap(): CapBridge | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: CapBridge }).Capacitor;
  return c?.isNativePlatform?.() ? c : null;
}

/** Está rodando dentro do app instalado? */
export function isNativeApp(): boolean {
  return cap() != null;
}

/**
 * Começa a receber a posição mesmo com a tela apagada (aparece uma notificação fixa
 * "registrando o trajeto" enquanto a corrida está em andamento). Devolve a função para parar.
 */
export async function startNativeWatch(
  onPoint: (lat: number, lng: number) => void,
  onError: (message: string, denied: boolean) => void
): Promise<(() => void) | null> {
  const c = cap();
  if (!c?.nativeCallback || !c.nativePromise) return null;
  let watcherId: string | null = null;
  try {
    const callbackId = c.nativeCallback(
      "BackgroundGeolocation",
      "addWatcher",
      {
        backgroundTitle: "Prime Vitória · corrida em andamento",
        backgroundMessage: "Registrando o trajeto para o passageiro acompanhar e o km ficar certo.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 15
      },
      (data, err) => {
        const e = err as NativeError | undefined;
        if (e) {
          const denied = e.code === "NOT_AUTHORIZED";
          onError(denied ? "Permissão de localização negada. Libere em Ajustes do app." : (e.message ?? "GPS indisponível."), denied);
          return;
        }
        const loc = data as NativeLocation | null;
        if (loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)) onPoint(loc.latitude, loc.longitude);
      }
    );
    watcherId = callbackId;
  } catch {
    return null;
  }
  return () => {
    if (watcherId) void c.nativePromise?.("BackgroundGeolocation", "removeWatcher", { id: watcherId }).catch(() => undefined);
  };
}
