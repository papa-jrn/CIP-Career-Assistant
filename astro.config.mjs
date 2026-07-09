import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  security: {
    // Framework-level CSRF: Astro enforces the Origin header on form-style
    // POST/PUT/PATCH/DELETE (multipart / x-www-form-urlencoded / text-plain).
    // JSON webhooks (e.g. Stripe, signature-verified) are exempt. Per-route
    // isSameOriginRequest() checks remain as a backstop.
    checkOrigin: true,
  },
  devToolbar: {
    enabled: false,
  },
  vite: {
    cacheDir: path.resolve(__dirname, ".vite"),
    build: {
      // Never inline small scripts into the HTML; the CSP only allows
      // external same-origin scripts in production.
      assetsInlineLimit: 0,
    },
    optimizeDeps: {
      noDiscovery: true,
      include: [],
      exclude: ["aria-query", "axobject-query"],
    },
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  },
});
