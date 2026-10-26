// Si la fenêtre d'aperçu bloque localStorage, on le remplace par un stockage en mémoire.
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? m.get(k)! : null),
    key: (i) => Array.from(m.keys())[i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, String(v)),
  };
}

let usable = false;
try {
  const t = "__erp_preview_test__";
  window.localStorage.setItem(t, "1");
  window.localStorage.removeItem(t);
  usable = true;
} catch {}

if (!usable) {
  const mem = memoryStorage();
  try {
    Object.defineProperty(window, "localStorage", { configurable: true, get: () => mem });
  } catch {}
}

export const storagePersists = usable;
