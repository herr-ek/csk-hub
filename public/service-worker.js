self.addEventListener("push", (event) => {
  if (event.data) {
    const data = event.data.json()
    const options = {
      body: data.body,
      icon: data.icon || "/notifications/icon.png",
      badge: "/notifications/badge.png",
      vibrate: [100, 50, 100],
      // A newer notification with the same tag replaces the older one, and still alerts.
      ...(data.tag ? { tag: data.tag, renotify: true } : {}),
      data: { url: data.url }
    }
    event.waitUntil(self.registration.showNotification(data.title, options))
  }
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  // The server only sends internal paths; still refuse anything that resolves off this origin.
  const target = new URL(event.notification.data?.url || "/", self.location.origin)
  const url = target.origin === self.location.origin ? target.href : new URL("/", self.location.origin).href
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // Bring an open app window to the notification's page rather than opening another.
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) return open.focus().then((focused) => focused.navigate(url))
      return clients.openWindow(url)
    })
  )
})
