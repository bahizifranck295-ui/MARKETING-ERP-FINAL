import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { seedData } from "./src/server/db";
import { apiRouter } from "./src/server/api";
import { flushOnExit, loadDatabase, persistAfterResponse, scheduleSave } from "./src/server/persistence";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Base de départ, puis base enregistrée (si elle existe) : les données survivent aux redémarrages
seedData();
if (!loadDatabase()) scheduleSave();
flushOnExit();

// Mount API router (enregistrement durable après chaque requête)
app.use("/api", persistAfterResponse, apiRouter);

// Deux applications, une seule API et une seule base (en mémoire, partagée) :
//  - Gestion commerciale sur PORT (3000)        → dist/
//  - Stock & Livraison sur LOGISTICS_PORT (3001) → dist-logistique/
const LOGISTICS_PORT = Number(process.env.LOGISTICS_PORT) || 3001;

async function mountFrontend(target: express.Express, erpApp: "commercial" | "logistique") {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      // Rechargement à chaud : un port HMR distinct pour la seconde application
      server: { middlewareMode: true, ...(erpApp === "logistique" ? { hmr: { port: 24679 } } : {}) },
      appType: "spa",
      define: { "import.meta.env.VITE_ERP_APP": JSON.stringify(erpApp) },
      cacheDir: erpApp === "logistique" ? "node_modules/.vite-logistique" : undefined,
    });
    target.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), erpApp === "logistique" ? "dist-logistique" : "dist");
    target.use(express.static(distPath));
    target.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
}

function listen(target: express.Express, port: number, label: string) {
  const server = target.listen(port, "0.0.0.0", () => {
    console.log(`${label} : http://0.0.0.0:${port}`);
  });
  server.timeout = 300000;
  server.keepAliveTimeout = 305000;
  server.headersTimeout = 310000;
}

async function start() {
  // L'application lancée seule (VITE_ERP_APP=logistique npm run dev) reste possible sur le port principal
  const mainApp = process.env.VITE_ERP_APP === "logistique" ? "logistique" : "commercial";
  await mountFrontend(app, mainApp);
  listen(app, PORT, mainApp === "logistique" ? "Stock & Livraison" : "Gestion commerciale");

  if (mainApp === "commercial" && process.env.LOGISTICS_PORT !== "0") {
    const logistics = express();
    logistics.use(express.json({ limit: "100mb" }));
    logistics.use(express.urlencoded({ limit: "100mb", extended: true }));
    logistics.use("/api", persistAfterResponse, apiRouter);
    await mountFrontend(logistics, "logistique");
    listen(logistics, LOGISTICS_PORT, "Stock & Livraison");
  }
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
