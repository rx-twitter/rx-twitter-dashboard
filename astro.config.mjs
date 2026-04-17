import node from "@astrojs/node";
import preact from "@astrojs/preact";
import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({
    mode: "standalone",
  }),
  integrations: [preact()],
  vite: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
  server: {
    port: 4321,
    host: true,
  },
});
