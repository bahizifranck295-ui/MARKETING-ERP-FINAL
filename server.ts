import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { seedData } from "./src/server/db";
import { apiRouter } from "./src/server/api";

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ limit: "100mb", extended: true }));

// Initialize in-memory seed data
seedData();

// Mount API router
app.use("/api", apiRouter);

// Vite middleware or static serving
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`ERP Distribution server running on http://0.0.0.0:${PORT}`);
  });

  server.timeout = 300000;
  server.keepAliveTimeout = 305000;
  server.headersTimeout = 310000;
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
