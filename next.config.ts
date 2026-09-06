import type { NextConfig } from "next"
import createNextIntlPlugin from "next-intl/plugin"

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  logging: {
    browserToTerminal: true
  },
  cacheComponents: true,
  partialPrefetching: true,
  reactStrictMode: true
  // allowedDevOrigins: ['10.0.0.7'],
}

const withNextIntl = createNextIntlPlugin("./src/core/i18n/request.ts")

export default withNextIntl(nextConfig)
