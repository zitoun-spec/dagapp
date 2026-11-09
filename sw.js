/* A version owns only its scoped shell cache; IndexedDB is never cleared. */
const VERSION = "4.0.0";
const PREFIX = "dagapp-shell:" + self.registration.scope + ":";
const CACHE = PREFIX + VERSION;
const SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "core.js",
  "icons.js",
  "sw.js",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
];
const url = (path) => new URL(path, self.registration.scope).href;
self.addEventListener("install", (event) =>
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await Promise.all(
        SHELL.map(async (path) => {
          const response = await fetch(
            new Request(url(path), { cache: "reload" }),
          );
          if (!response.ok) throw new Error("Shell download failed");
          await cache.put(url(path), response);
        }),
      );
      // Waiting is intentional: only a user action activates an update.
    })(),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys())
        if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  ),
);
self.addEventListener("fetch", (event) => {
  const request = event.request,
    u = new URL(request.url);
  if (
    request.method !== "GET" ||
    u.origin !== location.origin ||
    !u.href.startsWith(self.registration.scope)
  )
    return;
  const file = SHELL.find((path) => url(path) === u.origin + u.pathname);
  if (!file && request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE),
        cached = await cache.match(url(file || "index.html"));
      return cached || fetch(request);
    })(),
  );
});
self.addEventListener("push", (event) => {
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Dagritme", body: "Je hebt een herinnering" };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Dagritme", {
      body: data.body || "",
      tag: data.tag || "dagritme",
      renotify: false,
      icon: url("icon-192.png"),
      badge: url("icon-192.png"),
      data: { url: self.registration.scope },
    }),
  );
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      const client = list.find((c) =>
        c.url.startsWith(self.registration.scope),
      );
      if (client) return client.focus();
      return self.clients.openWindow(self.registration.scope);
    })(),
  );
});
