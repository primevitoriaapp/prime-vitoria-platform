/* Escopo /driver/ — rede direta; push FCM data-only exibe notificacao local. */
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }
  const title = typeof payload.title === "string" ? payload.title : "Prime Vitória";
  const body =
    typeof payload.body === "string"
      ? payload.body
      : typeof payload.eventType === "string"
        ? payload.eventType
        : "Nova actualização operacional";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: payload,
      tag: typeof payload.tripId === "string" ? `trip-${payload.tripId}` : "pv-driver"
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tripId = event.notification?.data?.tripId;
  const url = tripId ? `/driver?trip=${encodeURIComponent(tripId)}` : "/driver";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
