// Fait tourner src/server/api.ts + src/server/db.ts (inchangés) dans le navigateur.
// Les appels axios vers /api sont servis ici au lieu d'un serveur Node.
import axios from "axios";
import { db, seedData } from "../src/server/db";
import { apiRouter, JWT_SECRET } from "../src/server/api";
import { verify } from "./shims/jsonwebtoken";
import { fillDemo } from "./demo-fill";
import { ensureDemoAccounts } from "../src/server/demoAccounts";

const STORE_KEY = "erp_preview_db_v3"; // v3 : données de démo sur le site unique de Goma

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

// Premier chargement : données de base, puis jeu de démo complet (≈ 2 mois d’activité sur le site unique de Goma)
let ready: Promise<any> = Promise.resolve();
export const demoReady = () => ready;
// Comptes de démonstration de la page de connexion (ajoutés s'ils manquent, aussi aux données enregistrées)
if (load()) ensureDemoAccounts();
else {
  seedData();
  delete (db as any).demo_accounts_v1;
  ensureDemoAccounts();
  ready = fillDemo(
    (method, path, body, token, headers) =>
      dispatch(method, "/api" + path, { ...(headers || {}), ...(token ? { authorization: `Bearer ${token}` } : {}) }, body ?? undefined),
    db
  )
    .catch((e) => console.error("[démo]", e))
    .then(() => save());
}

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
