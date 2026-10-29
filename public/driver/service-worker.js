/* App do motorista (escopo /driver/): rede direta + avisos (Web Push). */
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
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof p.title === "string" ? p.title : "Prime Vitória";
  const url = typeof p.url === "string" ? p.url : p.tripId ? `/driver?trip=${encodeURIComponent(p.tripId)}` : "/driver";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof p.body === "string" ? p.body : "Atualização da central",
      icon: "/icon",
      badge: "/icon",
      tag: typeof p.tag === "string" ? p.tag : "pv-driver",
      renotify: true,
      requireInteraction: true,
      vibrate: [300, 120, 300, 120, 300],
      data: { url }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/driver";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes("/driver") && "focus" in c) {
          if ("navigate" in c) c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
