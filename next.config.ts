import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets a second dev server run beside the main one (e.g. NEXT_DIST_DIR=.next-alt).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // Let family phones on the home Wi-Fi reach the dev server.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
