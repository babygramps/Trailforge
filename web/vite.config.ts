import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/*.png"],
      manifest: false, // we supply our own public/manifest.json
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            // Cache map tiles from local proxy
            urlPattern: /\/(tiles|api\/proxy\/satellite)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "map-tiles",
              expiration: {
                maxEntries: 8000,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              rangeRequests: true,
            },
          },
          {
            // Cache external raster tile servers (OSM, OpenTopo, CyclOSM, Waymarked)
            urlPattern:
              /^https:\/\/(?:[a-c]\.)?(?:tile\.opentopomap\.org|tile\.openstreetmap\.org|tile-cyclosm\.openstreetmap\.fr|tile\.waymarkedtrails\.org)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "external-tiles",
              expiration: {
                maxEntries: 20000,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            // Network-first for API calls
            urlPattern: /\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
              networkTimeoutSeconds: 5,
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/tiles": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tiles/, ""),
      },
    },
  },
});
