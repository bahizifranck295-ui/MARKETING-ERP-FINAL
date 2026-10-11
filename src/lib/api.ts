import axios from "axios";
import { ERP_APP } from "@/app/edition";

export const API_BASE = "/api";
const STORAGE_ACCESS = "erp_access_token";
const STORAGE_REFRESH = "erp_refresh_token";

export const tokenStore = {
  get access() {
    return localStorage.getItem(STORAGE_ACCESS) || "";
  },
  get refresh() {
    return localStorage.getItem(STORAGE_REFRESH) || "";
  },
  set(tokens: { access_token?: string; refresh_token?: string }) {
    if (tokens?.access_token) localStorage.setItem(STORAGE_ACCESS, tokens.access_token);
    if (tokens?.refresh_token) localStorage.setItem(STORAGE_REFRESH, tokens.refresh_token);
  },
  clear() {
    localStorage.removeItem(STORAGE_ACCESS);
    localStorage.removeItem(STORAGE_REFRESH);
  },
};

export const api = axios.create({
  baseURL: API_BASE,
  timeout: 120000, // 2 minutes default timeout to prevent premature timeouts on uploads
});

api.interceptors.request.use((config) => {
  const t = tokenStore.access;
  if (t) config.headers.Authorization = `Bearer ${t}`;
  // Application appelante : le serveur n'ouvre à chacune que les routes de ses propres modules
  config.headers["X-ERP-App"] = ERP_APP;
  return config;
});

let isRefreshing = false;
let refreshQueue: Array<{ resolve: (val: any) => void; reject: (err: any) => void; original: any }> = [];

async function refreshAccess() {
  const rt = tokenStore.refresh;
  if (!rt) throw new Error("no refresh");
  const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refresh_token: rt });
  tokenStore.set(data);
  return data.access_token;
}

api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config || {};
    const status = error.response?.status;
    // Action refusée par le serveur : les droits ont peut-être changé, l'interface les recharge
    if (status === 403 && error.response?.data?.code === "PERMISSION_DENIED" && typeof window !== "undefined") {
      window.dispatchEvent(new Event("erp:permission-denied"));
    }
    const url = original.url || "";
    if (status === 401 && !original._retry && !url.includes("/auth/login") && !url.includes("/auth/refresh")) {
      original._retry = true;
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push({ resolve, reject, original });
        });
      }
      isRefreshing = true;
      try {
        const newTok = await refreshAccess();
        refreshQueue.forEach(({ resolve, original: orig }) => {
          orig.headers.Authorization = `Bearer ${newTok}`;
          resolve(api(orig));
        });
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${newTok}`;
        return api(original);
      } catch (e) {
        refreshQueue.forEach(({ reject }) => reject(e));
        refreshQueue = [];
        tokenStore.clear();
        if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
          window.location.href = "/login";
        }
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export function extractErrorMessage(err: any, fallback = "Une erreur est survenue.") {
  if (err?.code === "ECONNABORTED" || (err?.message && /timeout/i.test(err.message))) {
    return "Le délai d'attente du serveur (timeout) a été dépassé. Le fichier est volumineux ou la connexion est ralentie. L'opération a été sécurisée avec un délai prolongé, veuillez réessayer.";
  }
  const detail = err?.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg || d).join(", ");
  if (typeof detail === "string") return detail;
  return err?.message || fallback;
}
