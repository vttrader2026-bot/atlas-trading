// Atlas Trading service worker: shows push notifications and handles clicks.

// A minimal pass-through fetch handler. This intentionally does no caching
// or offline logic - it exists because Chrome's PWA install eligibility
// check (the "Add to Home Screen" prompt on Android) requires an active
// fetch handler to be present, not just push/notificationclick listeners.
//
// Only GET requests are forwarded through fetch(event.request) here. Non-GET
// requests (POST/PUT/PATCH/DELETE - e.g. the Analyzer's screenshot upload)
// are left completely alone: not calling event.respondWith() means the
// browser just makes the request normally, as if this handler didn't exist.
// This matters specifically on iOS Safari - re-forwarding a request that
// has a body (like a multipart image upload) through event.request into
// fetch() is unreliable in Safari's standalone/Home-Screen PWA mode and can
// break the request outright, even though the exact same code works fine
// in a normal browser tab. Guarding to GET-only avoids that entirely while
// still satisfying Chrome's "has an active fetch handler" install check.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
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
