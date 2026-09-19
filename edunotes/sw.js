const DEFAULT_TITLE = "EduNotes Pro";
const DEFAULT_BODY = "You have a new notification.";
const DEFAULT_ICON = "/icon-192.svg";
const DEFAULT_BADGE = "/icon-192.svg";
const DEFAULT_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};

      if (event.data) {
        try {
          data = event.data.json() || {};
        } catch {
          try {
            data = {
              title: DEFAULT_TITLE,
              body: event.data.text() || DEFAULT_BODY,
            };
          } catch {
            data = {};
          }
        }
      }

      const title = String(data.title || DEFAULT_TITLE);
      const body = String(data.body || DEFAULT_BODY);
      const tag = String(
        data.tag || `edunotes-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      );

      const options = {
        body,
        icon: data.icon || DEFAULT_ICON,
        badge: data.badge || DEFAULT_BADGE,
        tag,
        renotify: true,
        requireInteraction: true,
        vibrate: Array.isArray(data.vibrate)
          ? data.vibrate
          : [250, 100, 250, 100, 350],
        timestamp: Date.now(),
        data: {
          url: data.url || DEFAULT_URL,
        },
      };

      try {
        await self.registration.showNotification(title, options);
      } catch (error) {
        // Retry without optional visual/vibration fields for stricter browsers.
        console.error("EduNotes Pro notification error:", error);
        await self.registration.showNotification(title, {
          body,
          tag,
          renotify: true,
          data: { url: data.url || DEFAULT_URL },
        });
      }
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    (async () => {
      const rawUrl = event.notification?.data?.url || DEFAULT_URL;
      let targetUrl = DEFAULT_URL;

      try {
        const parsed = new URL(rawUrl, self.location.origin);
        targetUrl =
          parsed.origin === self.location.origin
            ? `${parsed.pathname}${parsed.search}${parsed.hash}`
            : DEFAULT_URL;
      } catch {
        targetUrl = DEFAULT_URL;
      }

      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of clientList) {
        if ("focus" in client) {
          try {
            await client.navigate(targetUrl);
          } catch {
            // Some browsers don't allow navigate on an existing client.
          }
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }

      return undefined;
    })(),
  );
});
