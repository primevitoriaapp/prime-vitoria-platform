export type NavPoint = {
  lat?: number | null;
  lng?: number | null;
  label?: string | null;
};

export type DriverNavigationRoute = {
  origin: NavPoint;
  destination: NavPoint;
  /** Parada intermédia (ex.: pickup antes do destino final). */
  waypoint?: NavPoint | null;
};

function encodePoint(point: NavPoint): string | null {
  if (point.lat != null && point.lng != null && !Number.isNaN(point.lat) && !Number.isNaN(point.lng)) {
    return `${point.lat},${point.lng}`;
  }
  const q = (point.label ?? "").trim();
  return q ? encodeURIComponent(q) : null;
}

function encodeWaypoint(point: NavPoint): string | null {
  const coords = encodePoint(point);
  if (coords == null) return null;
  if (coords.includes(",")) return coords;
  return coords;
}

/**
 * Google Maps Directions API URL (MVP).
 * Suporta origem, destino e um waypoint.
 * @see https://developers.google.com/maps/documentation/urls/get-started#directions-action
 */
export function buildGoogleMapsDirectionsUrl(route: DriverNavigationRoute): string {
  const dest = encodePoint(route.destination);
  const origin = encodePoint(route.origin);
  const waypoint = route.waypoint ? encodeWaypoint(route.waypoint) : null;

  const params = new URLSearchParams({ api: "1" });
  if (dest) params.set("destination", dest);
  if (origin) params.set("origin", origin);
  if (waypoint) params.set("waypoints", waypoint);

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/**
 * Waze deep link — navega para um ponto (embarque ou destino).
 */
export function buildWazeNavigateUrl(point: NavPoint): string | null {
  if (point.lat == null || point.lng == null || Number.isNaN(point.lat) || Number.isNaN(point.lng)) {
    return null;
  }
  return `waze://?ll=${point.lat},${point.lng}&navigate=yes`;
}

/** Google Maps — direcções até um único ponto. */
export function buildGoogleMapsPointUrl(point: NavPoint): string {
  const dest = encodePoint(point);
  const params = new URLSearchParams({ api: "1" });
  if (dest) params.set("destination", dest);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Apple Maps — direcções até um único ponto. */
export function buildAppleMapsPointUrl(point: NavPoint): string {
  const dest = encodePoint(point);
  const params = new URLSearchParams({ dirflg: "d" });
  if (dest) params.set("daddr", dest);
  return `https://maps.apple.com/?${params.toString()}`;
}

export function buildNavigationLinksToPoint(point: NavPoint): NavigationLink[] {
  const links: NavigationLink[] = [];
  links.push({ id: "google", label: "Google Maps", href: buildGoogleMapsPointUrl(point) });
  const waze = buildWazeNavigateUrl(point);
  if (waze) links.push({ id: "waze", label: "Waze", href: waze });
  links.push({ id: "apple", label: "Apple Maps", href: buildAppleMapsPointUrl(point) });
  return links;
}

/**
 * Waze deep link — navega para destino final (rota completa).
 * @deprecated Prefer buildNavigationLinksToPoint para embarque/destino separados.
 */
export function buildWazeNavigateToDestination(destination: NavPoint): string | null {
  return buildWazeNavigateUrl(destination);
}

/**
 * Apple Maps (iOS / macOS) — origem + destino.
 * Waypoint como parada intermédia via parâmetro `saddr`/`daddr` (MVP: destino principal).
 */
export function buildAppleMapsNavigateUrl(route: DriverNavigationRoute): string {
  const dest = encodePoint(route.destination);
  const origin = encodePoint(route.origin);
  const params = new URLSearchParams({ dirflg: "d" });
  if (dest) params.set("daddr", dest);
  if (origin) params.set("saddr", origin);
  return `https://maps.apple.com/?${params.toString()}`;
}

export type NavigationLink = { id: "google" | "waze" | "apple"; label: string; href: string };

/**
 * Links de navegação MVP (origem + destino + waypoint opcional).
 *
 * Fase futura (sem implementar agora):
 * - Android Auto: Navigation SDK / intent `androidx.car.app`
 * - Apple CarPlay: MKMapItem + CPTemplateApplicationScene
 * Manter `DriverNavigationRoute` como contrato estável para essas integrações.
 */
export function buildDriverNavigationLinks(route: DriverNavigationRoute): NavigationLink[] {
  const links: NavigationLink[] = [];
  links.push({ id: "google", label: "Google Maps", href: buildGoogleMapsDirectionsUrl(route) });
  const waze = buildWazeNavigateUrl(route.destination);
  if (waze) links.push({ id: "waze", label: "Waze", href: waze });
  links.push({ id: "apple", label: "Apple Maps", href: buildAppleMapsNavigateUrl(route) });
  return links;
}
