import type { NextConfig } from "next"

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

export default nextConfig
