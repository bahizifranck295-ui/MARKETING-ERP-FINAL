// Fait tourner src/server/api.ts + src/server/db.ts (inchangés) dans le navigateur.
// Les appels axios vers /api sont servis ici au lieu d'un serveur Node.
import axios from "axios";
import { db, seedData } from "../src/server/db";
import { apiRouter, JWT_SECRET } from "../src/server/api";
import { verify } from "./shims/jsonwebtoken";
import { fillDemo } from "./demo-fill";
import { ensureDemoAccounts } from "../src/server/demoAccounts";

/*
 * Deux espaces de données séparés :
 * - « demo » : jeu de démonstration complet, ouvert par les boutons « Comptes de démonstration » ;
 * - « real » : site vierge, prêt à recevoir les vraies données (connexion normale).
 * L'espace actif est mémorisé dans le navigateur et choisi au moment de la connexion.
 */
type DataMode = "demo" | "real";
// Structure vide de la base (avant toute donnée), pour repartir proprement à chaque changement d'espace
const EMPTY_DB = JSON.parse(JSON.stringify(db));
const MODE_KEY = "erp_data_mode";
const STORE_KEYS: Record<DataMode, string> = {
  demo: "erp_preview_db_v3", // v3 : données de démo sur le site unique de Goma
  real: "erp_real_db_v1",
};
const readMode = (): DataMode => {
  try {
    return localStorage.getItem(MODE_KEY) === "demo" ? "demo" : "real";
  } catch {
    return "real";
  }
};
let mode: DataMode = readMode();
let STORE_KEY = STORE_KEYS[mode];

function load(): boolean {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    Object.assign(db, JSON.parse(raw));
    return true;
  } catch {
    return false;
  }
}

let saveTimer: number | undefined;
function save() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(db));
    } catch {
      // stockage plein ou bloqué : les données restent en mémoire
    }
  }, 300);
}

export function resetDemoData() {
  try {
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(MODE_KEY);
    localStorage.removeItem("erp_access_token");
    localStorage.removeItem("erp_refresh_token");
  } catch {}
  location.reload();
}

// Session expirée : on repart de la page de connexion au lieu de laisser
// l'application recharger la fenêtre vers /login (impossible dans l'aperçu).
try {
  const rt = localStorage.getItem("erp_refresh_token");
  if (rt) verify(rt, JWT_SECRET);
} catch {
  try {
    localStorage.removeItem("erp_access_token");
    localStorage.removeItem("erp_refresh_token");
  } catch {}
}

// Site vierge : la configuration (rôles, permissions, dépôt, catégories, taux) et le seul compte
// administrateur ; aucun client, produit, vente, mouvement de caisse ni journal.
function blankDatabase() {
  seedData();
  (db as any).demo_accounts_v1 = true; // pas de comptes de démonstration dans le site vierge
  db.users = db.users.filter((u) => u.role_code === "super_admin");
  for (const k of ["products", "clients", "orders", "cash_sessions", "cash_operations", "deliveries", "credits", "notifications",
    "objectives", "audit_logs", "stock_movements", "stock_levels", "stock_transfers", "stock_reports", "vehicles",
    "embarked_stocks", "embarked_levels", "embarked_movements", "accounting_movements"]) (db as any)[k] = [];
}

// Jeu de démonstration complet (≈ 2 mois d'activité sur le site unique de Goma)
function demoDatabase(): Promise<any> {
  seedData();
  delete (db as any).demo_accounts_v1;
  ensureDemoAccounts();
  return fillDemo(
    (method, path, body, token, headers) =>
      dispatch(method, "/api" + path, { ...(headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body ?? undefined),
    db
  )
    .catch((e) => console.error("[démo]", e))
    .then(() => save());
}

// Ouverture de l'espace actif (enregistré, sinon créé)
function openStore(): Promise<any> {
  if (load()) {
    if (mode === "demo") ensureDemoAccounts();
    return Promise.resolve();
  }
  if (mode === "demo") return demoDatabase();
  blankDatabase();
  save();
  return Promise.resolve();
}

let ready: Promise<any> = openStore();
export const demoReady = () => ready;

// Changement d'espace à la connexion (appelé par la page de connexion, sans rechargement)
async function setMode(next: DataMode) {
  await ready;
  if (next === mode) return;
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(db));
  } catch {}
  for (const k of Object.keys(db)) delete (db as any)[k];
  Object.assign(db, JSON.parse(JSON.stringify(EMPTY_DB)));
  mode = next;
  STORE_KEY = STORE_KEYS[mode];
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {}
  ready = openStore();
  await ready;
}
(window as any).__erpDataMode = { get: () => mode, set: setMode };

function parseBody(data: any) {
  if (data == null || data === "") return {};
  if (typeof data === "string") {
    try { return JSON.parse(data); } catch { return data; }
  }
  if (typeof FormData !== "undefined" && data instanceof FormData) {
    const o: any = {};
    data.forEach((v, k) => (o[k] = v));
    return o;
  }
  return data;
}

async function dispatch(method: string, url: string, headers: any, data: any) {
  const u = new URL(url, "http://local");
  const path = u.pathname.replace(/^\/api/, "") || "/";
  const query: any = {};
  u.searchParams.forEach((v, k) => (query[k] = v));
  const lower: any = {};
  Object.entries(headers || {}).forEach(([k, v]) => (lower[k.toLowerCase()] = v));
  const req: any = { method: method.toUpperCase(), path, url: path + u.search, query, params: {}, headers: lower, body: parseBody(data) };
  const res: any = {
    statusCode: 200, body: undefined, finished: false, headers: {},
    status(c: number) { this.statusCode = c; return this; },
    json(b: any) { this.body = b; this.finished = true; return this; },
    send(b: any) { this.body = b; this.finished = true; return this; },
    end() { this.finished = true; return this; },
    setHeader(k: string, v: any) { this.headers[k] = v; return this; },
  };
  try {
    const handled = await apiRouter.handle(req, res);
    if (!handled) res.status(404).json({ detail: `Route introuvable : ${req.method} /api${path}` });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ detail: e?.message || "Erreur serveur" });
  }
  if (req.method !== "GET") save();
  // copie pour éviter que l'interface ne modifie les objets de la base par référence
  return { status: res.statusCode, data: res.body === undefined ? undefined : JSON.parse(JSON.stringify(res.body)) };
}

axios.defaults.adapter = async (config: any) => {
  await ready;
  const full = (config.baseURL && !/^https?:/.test(config.url) ? config.baseURL.replace(/\/$/, "") + "/" + String(config.url).replace(/^\//, "") : config.url) as string;
  // Comme axios : les paramètres vides (undefined / null) ne sont pas envoyés
  const clean = Object.entries(config.params || {}).filter(([, v]) => v !== undefined && v !== null) as Array<[string, string]>;
  const params = clean.length ? "?" + new URLSearchParams(clean.map(([k, v]) => [k, String(v)])).toString() : "";
  const headers = typeof config.headers?.toJSON === "function" ? config.headers.toJSON() : config.headers;
  const { status, data } = await dispatch(config.method || "get", full + params, headers, config.data);
  const response = { data, status, statusText: String(status), headers: {}, config, request: {} };
  if (config.validateStatus ? config.validateStatus(status) : status >= 200 && status < 300) return response;
  const err: any = new Error(`Request failed with status code ${status}`);
  err.config = config; err.response = response; err.isAxiosError = true;
  throw err;
};
