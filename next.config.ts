import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const headers = async () => [
  {
    source: "/(.*)",
    headers: [
      {
        key: "X-Content-Type-Options",
        value: "nosniff"
      },
      {
        key: "X-Frame-Options",
        value: "DENY"
      },
      {
        key: "Referrer-Policy",
        value: "strict-origin-when-cross-origin"
      }
    ]
  },
  {
    source: "/service-worker.js",
    headers: [
      {
        key: "Content-Type",
        value: "application/javascript; charset=utf-8"
      },
      {
        key: "Cache-Control",
        value: "no-cache, no-store, must-revalidate"
      },
      {
        key: "Content-Security-Policy",
        value: "default-src 'self'; script-src 'self'"
      }
    ]
  }
]

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  logging: {
    browserToTerminal: true
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactStrictMode: true,
  headers
}

const withNextIntl = createNextIntlPlugin("./src/core/i18n/request.ts")

export default withNextIntl(nextConfig)
