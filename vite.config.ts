import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(projectRoot, "frontend"),
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(projectRoot, "static/frontend"),
    emptyOutDir: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(projectRoot, "frontend/index.html"),
      output: {
        entryFileNames: "app.js",
        assetFileNames: (asset) =>
          asset.name?.endsWith(".css") ? "app.css" : "[name][extname]",
      },
    },
  },
});
