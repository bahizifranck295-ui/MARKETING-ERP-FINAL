import { useSyncExternalStore } from "react";

/*
 * Thème de l'application (clair / sombre / système), sans rechargement ni redirection.
 *  - Préférence enregistrée par utilisateur (plusieurs comptes sur un même appareil gardent chacun la leur),
 *    plus la dernière préférence de l'appareil, lue avant le premier affichage (pas de flash du mauvais thème).
 *  - « Système » suit la préférence du système d'exploitation ; « Clair » et « Sombre » sont prioritaires.
 *  - À l'impression, le rendu clair est utilisé le temps de l'impression.
 */
export type ThemePref = "light" | "dark" | "system";
export type Theme = "light" | "dark";

const DEVICE_KEY = "premidis_theme";
const userKey = (id: string) => `premidis_theme:${id}`;

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* stockage indisponible : le thème reste valable pour la session */
  }
};
const valid = (v: any): v is ThemePref => v === "light" || v === "dark" || v === "system";

const media = typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
let userId: string | null = null;
let pref: ThemePref = valid(read(DEVICE_KEY)) ? (read(DEVICE_KEY) as ThemePref) : "light";
const listeners = new Set<() => void>();

const resolve = (p: ThemePref): Theme => (p === "system" ? (media?.matches ? "dark" : "light") : p);
let printing = false;

function apply(animate: boolean) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const theme = printing ? "light" : resolve(pref);
  if (animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    root.classList.add("theme-transition");
    window.setTimeout(() => root.classList.remove("theme-transition"), 260);
  }
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  listeners.forEach((l) => l());
}

/** À appeler une fois au démarrage, avant le rendu */
export function initTheme() {
  apply(false);
  media?.addEventListener?.("change", () => pref === "system" && apply(true));
  window.addEventListener("beforeprint", () => {
    printing = true;
    apply(false);
  });
  window.addEventListener("afterprint", () => {
    printing = false;
    apply(false);
  });
}

/** Utilisateur connecté : sa préférence personnelle (s'il en a une) devient active */
export function setThemeUser(id: string | null) {
  if (id === userId) return;
  userId = id;
  const own = id ? read(userKey(id)) : null;
  if (valid(own) && own !== pref) {
    pref = own;
    write(DEVICE_KEY, own);
    apply(true);
  }
}

export function setThemePref(next: ThemePref) {
  pref = next;
  write(DEVICE_KEY, next);
  if (userId) write(userKey(userId), next);
  apply(true);
}

export const getThemePref = () => pref;
export const getTheme = (): Theme => resolve(pref);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getTheme);
  const p = useSyncExternalStore(subscribe, getThemePref);
  return {
    theme,
    pref: p,
    setPref: setThemePref,
    toggle: () => setThemePref(theme === "dark" ? "light" : "dark"),
  };
}
