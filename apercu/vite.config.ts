import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, "..");

export default defineConfig({
  root: here,
  base: "./",
  publicDir: path.join(app, "public"),
  plugins: [
    react(),
    tailwindcss(),
    {
      // Les images "/assets/..." de l'application sont relues en "./assets/..."
      // dans l'aperçu (fichiers sources inchangés), car il n'est pas servi à la racine.
      name: "preview-relative-assets",
      transform(code, id) {
        if (!id.startsWith(path.join(app, "src")) || !code.includes('"/assets/')) return null;
        return { code: code.split('"/assets/').join('"./assets/'), map: null };
      },
    },
  ],
  define: { "process.env": "{}" },
  resolve: {
    alias: [
      { find: "@", replacement: path.join(app, "src") },
      { find: /^express$/, replacement: path.join(here, "shims/express.ts") },
      { find: /^jsonwebtoken$/, replacement: path.join(here, "shims/jsonwebtoken.ts") },
      { find: /^react-router-dom$/, replacement: path.join(here, "shims/react-router-dom.tsx") },
    ],
  },
  build: { outDir: path.join(here, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 5000 },
});
