/* Service worker raiz (todos os apps): avisos (Web Push) e o mínimo para o celular aceitar "Instalar app". Sem cache. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Só as aberturas de página passam por aqui, direto pela rede (o Chrome exige um "fetch" para instalar).
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let p = {};
  try {
    p = event.data ? event.data.json() : {};
  } catch {
    p = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(typeof p.title === "string" ? p.title : "Prime Vitória", {
      body: typeof p.body === "string" ? p.body : "Novo aviso da operação",
      icon: "/icon",
      badge: "/icon",
      tag: typeof p.tag === "string" ? p.tag : "pv-central",
      renotify: true,
      data: { url: typeof p.url === "string" ? p.url : "/dashboard" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) {
          if ("navigate" in c) c.navigate(url).catch(() => undefined);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
