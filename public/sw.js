// Atlas Trading service worker: shows push notifications and handles clicks.

// A minimal pass-through fetch handler. This intentionally does no caching
// or offline logic — it exists because Chrome's PWA install eligibility
// check (the "Add to Home Screen" prompt on Android) requires an active
// fetch handler to be present, not just push/notificationclick listeners.
// Every request is simply forwarded to the network unchanged.
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = {};
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Atlas Trading", {
      body: data.body || "",
      icon: "/brand/icon-192.png",
      badge: "/brand/icon-192.png",
      tag: data.tag,
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          if ("navigate" in client) client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});