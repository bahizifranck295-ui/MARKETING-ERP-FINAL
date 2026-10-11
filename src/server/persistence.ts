import fs from "fs";
import path from "path";
import { db } from "./db";

/*
 * Enregistrement durable de la base (serveur Node uniquement ; l'aperçu navigateur a son propre stockage).
 * Toute la base — données métier, utilisateurs, rôles, permissions individuelles, périmètres, journal
 * d'audit et alertes — est écrite dans un fichier JSON après les requêtes (écriture groupée, atomique :
 * fichier temporaire puis renommage) et relue au démarrage. Désactivable avec ERP_PERSIST=0.
 */
const FILE = path.resolve(process.env.ERP_DATA_FILE || "data/erp-db.json");
export const persistenceEnabled = process.env.ERP_PERSIST !== "0";

/** Relit la base enregistrée ; retourne false s'il n'y en a pas encore (la base de départ est conservée) */
export function loadDatabase(): boolean {
  if (!persistenceEnabled || !fs.existsSync(FILE)) return false;
  const saved = JSON.parse(fs.readFileSync(FILE, "utf8"));
  for (const k of Object.keys(saved)) (db as any)[k] = saved[k];
  console.log(`Base relue depuis ${FILE}`);
  return true;
}

let timer: NodeJS.Timeout | null = null;
function writeNow() {
  timer = null;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    console.error("Enregistrement de la base impossible :", e);
  }
}

/** Planifie un enregistrement (groupé : au plus une écriture par seconde) */
export function scheduleSave() {
  if (!persistenceEnabled || timer) return;
  timer = setTimeout(writeNow, 1000);
}

/** Middleware : enregistre après chaque requête de l'API (les consultations journalisées comprises) */
export function persistAfterResponse(_req: any, res: any, next: any) {
  res.on("finish", scheduleSave);
  next();
}

/** Enregistre immédiatement à l'arrêt du serveur */
export function flushOnExit() {
  if (!persistenceEnabled) return;
  const flush = () => {
    if (timer) clearTimeout(timer);
    writeNow();
    process.exit(0);
  };
  process.once("SIGINT", flush);
  process.once("SIGTERM", flush);
}
