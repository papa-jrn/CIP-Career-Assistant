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
    checkOrigin: false,
  },
  devToolbar: {
    enabled: false,
  },
  vite: {
    cacheDir: path.resolve(__dirname, ".vite"),
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
