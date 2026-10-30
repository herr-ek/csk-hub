self.addEventListener("push", (event) => {
  if (event.data) {
    const data = event.data.json()
    const options = {
      body: data.body,
      icon: data.icon || "/notifications/icon.png",
      badge: "/notifications/badge.png",
      vibrate: [100, 50, 100],
      tag: data.tag,
      data: { href: data.href || "/" }
    }
    event.waitUntil(self.registration.showNotification(data.title, options))
  }
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const target = new URL(event.notification.data?.href || "/", self.location.origin)
      if (target.origin !== self.location.origin) return
      const windows = await clients.matchAll({ type: "window", includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin !== self.location.origin) continue
        await client.navigate(target.href)
        await client.focus()
        return
      }
      await clients.openWindow(target.href)
    })()
  )
})
