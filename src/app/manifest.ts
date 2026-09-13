import type { MetadataRoute } from "next"
import { app } from "@/core/config/app"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: app.name,
    short_name: app.name,
    id: "/",
    start_url: "/",
    scope: "/",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable"
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    theme_color: "#ffffff",
    background_color: "#ffffff",
    display: "standalone"
  }
}
