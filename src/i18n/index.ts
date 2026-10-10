import { jsPDF } from "jspdf";
import { EXACT, PATTERNS } from "./en";

/*
 * Traduction globale de l'ERP (Français par défaut / English).
 *
 * L'interface est écrite en français ; lorsque l'anglais est choisi, les
 * libellés affichés (textes, placeholders, infobulles, notifications, messages
 * d'erreur, documents PDF générés) sont remplacés à l'affichage grâce au
 * dictionnaire centralisé ./en.ts.
 * - Seuls les textes présents dans le dictionnaire sont traduits : les données
 *   métier saisies (noms, produits, montants, notes…) ne sont jamais modifiées.
 * - Les champs de saisie et les zones marquées [data-no-translate] sont ignorés.
 * - Le choix est enregistré dans le navigateur (conservé entre les pages et
 *   après une nouvelle connexion).
 */

export type Lang = "fr" | "en";
const STORAGE_KEY = "erp.lang";
const listeners = new Set<(l: Lang) => void>();

function readStored(): Lang {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "fr";
  } catch {
    return "fr";
  }
}

let current: Lang = readStored();
export const getLang = () => current;

// ---------------------------------------------------------------- dictionnaire
const exactMap = new Map<string, string>();
const norm = (s: string) => s.replace(/[\s  ]+/g, " ").trim();
for (const [fr, en] of Object.entries(EXACT)) exactMap.set(norm(fr), en);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.entries(PATTERNS)
  .map(([fr, en]) => {
    const order: number[] = [];
    const src = norm(fr)
      .split(/(\{\d+\})/)
      .map((part) => {
        const m = part.match(/^\{(\d+)\}$/);
        if (m) {
          order.push(Number(m[1]));
          return "(.+?)";
        }
        return escapeRe(part).replace(/ /g, "\\s+");
      })
      .join("");
    return { re: new RegExp(`^${src}$`), order, en, weight: fr.replace(/\{\d+\}/g, "").length };
  })
  .sort((a, b) => b.weight - a.weight);

const cache = new Map<string, string | null>();
const HAS_LETTER = /[A-Za-zÀ-ÿ]/;

function lookup(core: string, depth = 0): string | null {
  const hit = exactMap.get(core);
  if (hit !== undefined) return hit;
  // Ponctuation finale (« Dépôt : », « Chargement… ») : on traduit le libellé et on la garde
  const tail = core.match(/^(.*?)(\s*[:：]|\s*(?:…|\.\.\.)|\s*\*)$/);
  if (tail && tail[1]) {
    const t = exactMap.get(tail[1].trim());
    if (t !== undefined) return t + (tail[2].trim() === ":" ? ":" : tail[2]);
  }
  if (depth > 0) return null;
  for (const p of patterns) {
    const m = core.match(p.re);
    if (!m) continue;
    return p.en.replace(/\{(\d+)\}/g, (_, i) => {
      const v = m[p.order.indexOf(Number(i)) + 1] ?? "";
      // Une valeur qui est elle-même un libellé connu (ex. un statut) est traduite ; sinon conservée
      return lookup(v.trim(), 1) ?? v;
    });
  }
  // Libellés composés « A · B » (filtres, sous-titres) : chaque partie connue est traduite
  if (core.includes(" · ")) {
    const parts = core.split(" · ");
    const out = parts.map((x) => lookup(x.trim(), 0) ?? x);
    if (out.some((x, i) => x !== parts[i])) return out.join(" · ");
  }
  return null;
}

/** Traduit un texte affiché (retourne le texte d'origine s'il n'est pas dans le dictionnaire). */
export function translateText(text: string): string {
  if (current !== "en" || !text || text.length > 600 || !HAS_LETTER.test(text)) return text;
  let res = cache.get(text);
  if (res === undefined) {
    const core = norm(text);
    const t = core ? lookup(core) : null;
    res = t === null ? null : text.replace(/^(\s*)[\s\S]*?(\s*)$/, (_, a, b) => `${a}${t}${b}`);
    cache.set(text, res);
  }
  return res ?? text;
}

/** Utilitaire pour le code : t("Texte français") */
export const t = translateText;

// ------------------------------------------------------------------ DOM
type Rec = { fr: string; en: string };
const textRec = new WeakMap<Node, Rec>();
const attrRec = new WeakMap<Element, Record<string, Rec>>();
const ATTRS = ["placeholder", "title", "aria-label", "alt"];
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "TEXTAREA", "CODE", "PRE", "NOSCRIPT"]);

function skipped(el: Element | null): boolean {
  for (let e = el; e; e = e.parentElement) {
    if (SKIP_TAGS.has(e.tagName)) return true;
    if (e.hasAttribute("data-no-translate") || (e as HTMLElement).isContentEditable) return true;
  }
  return false;
}

/*
 * Phrase découpée par React en plusieurs nœuds texte (« Affichage de », « 8 »,
 * « sur », « 9 »…) : on traduit la phrase complète dans le premier nœud et on
 * vide les suivants. Les valeurs d'origine restent mémorisées pour chaque nœud.
 */
function frValue(n: Text) {
  const rec = textRec.get(n);
  return rec && rec.en === n.nodeValue ? rec.fr : n.nodeValue || "";
}

/** Suite de nœuds texte adjacents contenant `node` (une phrase découpée par React). */
function textRun(node: Text): Text[] {
  let first: ChildNode = node;
  while (first.previousSibling?.nodeType === Node.TEXT_NODE) first = first.previousSibling;
  const run: Text[] = [];
  for (let n: ChildNode | null = first; n && n.nodeType === Node.TEXT_NODE; n = n.nextSibling) run.push(n as Text);
  return run;
}

function translateRun(nodes: Text[]): boolean {
  if (nodes.length < 2) return false;
  if (skipped(nodes[0].parentElement)) return true;
  const fr = nodes.map(frValue);
  const joined = fr.join("");
  const en = translateText(joined);
  if (en === joined) {
    // Pas de phrase connue : traduction nœud par nœud
    nodes.forEach((n, i) => {
      const t = translateText(fr[i]);
      if (t !== fr[i]) {
        textRec.set(n, { fr: fr[i], en: t });
        if (n.nodeValue !== t) n.nodeValue = t;
      } else {
        textRec.delete(n);
        if (n.nodeValue !== fr[i]) n.nodeValue = fr[i];
      }
    });
    return true;
  }
  nodes.forEach((n, i) => {
    const v = i === 0 ? en : "";
    textRec.set(n, { fr: fr[i], en: v });
    if (n.nodeValue !== v) n.nodeValue = v;
  });
  return true;
}

function translateGroup(el: Element | null) {
  el?.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE && n.previousSibling?.nodeType !== Node.TEXT_NODE) translateRun(textRun(n as Text));
  });
}

function translateTextNode(node: Text) {
  if (translateRun(textRun(node))) return;
  const value = node.nodeValue || "";
  const rec = textRec.get(node);
  if (rec && rec.en === value) return; // déjà traduit
  if (skipped(node.parentElement)) return;
  const en = translateText(value);
  if (en !== value) {
    textRec.set(node, { fr: value, en });
    node.nodeValue = en;
  } else if (rec) textRec.delete(node);
}

function translateAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const recs = attrRec.get(el) || {};
    if (recs[a]?.en === v) continue;
    const en = translateText(v);
    if (en !== v) {
      recs[a] = { fr: v, en };
      attrRec.set(el, recs);
      el.setAttribute(a, en);
    }
  }
}

function translateTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return translateTextNode(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  if (root.nodeType === Node.ELEMENT_NODE) {
    if (skipped(root as Element)) return;
    translateAttrs(root as Element);
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) =>
      n.nodeType === Node.ELEMENT_NODE && (SKIP_TAGS.has((n as Element).tagName) || (n as Element).hasAttribute("data-no-translate"))
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) translateTextNode(n as Text);
    else translateAttrs(n as Element);
  }
}

function restoreTree() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const rec = textRec.get(n);
      if (rec && n.nodeValue === rec.en) n.nodeValue = rec.fr;
      textRec.delete(n);
    } else {
      const recs = attrRec.get(n as Element);
      if (!recs) continue;
      for (const [a, rec] of Object.entries(recs)) if ((n as Element).getAttribute(a) === rec.en) (n as Element).setAttribute(a, rec.fr);
      attrRec.delete(n as Element);
    }
  }
}

let observer: MutationObserver | null = null;
let originalTitle = "";

function startObserver() {
  if (observer || typeof document === "undefined") return;
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === "characterData") translateTextNode(m.target as Text);
      else if (m.type === "attributes") translateAttrs(m.target as Element);
      else {
        m.addedNodes.forEach((n) => translateTree(n));
        if (m.removedNodes.length && m.target.nodeType === Node.ELEMENT_NODE) translateGroup(m.target as Element);
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  translateTree(document.body);
  originalTitle = document.title;
  document.title = translateText(document.title);
}

function stopObserver() {
  observer?.disconnect();
  observer = null;
  restoreTree();
  if (originalTitle) document.title = originalTitle;
}

// ------------------------------------------- documents PDF, dates, boîtes de dialogue
let patched = false;
function patchRuntime() {
  if (patched) return;
  patched = true;

  const tr = (v: any): any => (typeof v === "string" ? translateText(v) : Array.isArray(v) ? v.map(tr) : v);
  const api: any = (jsPDF as any).API;
  // Textes écrits dans les PDF (avant le calcul de l'alignement)
  const trLine = (v: any): any => (typeof v === "string" ? translateText(v) : Array.isArray(v) ? (typeof v[0] === "string" && v.length === 3 && typeof v[1] === "number" ? [translateText(v[0]), v[1], v[2]] : v.map(trLine)) : v);
  api.events.push([
    "preProcessText",
    (payload: any) => {
      if (current === "en" && payload) payload.text = trLine(payload.text);
    },
  ]);
  const origSplit = api.splitTextToSize;
  if (origSplit)
    api.splitTextToSize = function (text: any, ...rest: any[]) {
      return origSplit.call(this, current === "en" ? tr(text) : text, ...rest);
    };
  const origWidth = api.getTextWidth;
  if (origWidth)
    api.getTextWidth = function (text: any, ...rest: any[]) {
      return origWidth.call(this, current === "en" ? tr(text) : text, ...rest);
    };
  const origProps = api.setProperties;
  if (origProps)
    api.setProperties = function (p: any, ...rest: any[]) {
      if (current === "en" && p && typeof p === "object") p = { ...p, title: tr(p.title), subject: tr(p.subject) };
      return origProps.call(this, p, ...rest);
    };

  // Dates « fr-FR » affichées au format anglais
  const loc = (l: any) => (current === "en" && (l === undefined || (typeof l === "string" && /^fr/i.test(l))) ? "en-GB" : l);
  const D = Date.prototype as any;
  for (const fn of ["toLocaleDateString", "toLocaleString", "toLocaleTimeString"]) {
    const orig = D[fn];
    D[fn] = function (l?: any, o?: any) {
      return orig.call(this, loc(l), o);
    };
  }
  const OrigDTF = Intl.DateTimeFormat;
  const PatchedDTF: any = function (this: any, l?: any, o?: any) {
    return new (OrigDTF as any)(loc(l), o);
  };
  PatchedDTF.prototype = OrigDTF.prototype;
  PatchedDTF.supportedLocalesOf = OrigDTF.supportedLocalesOf;
  (Intl as any).DateTimeFormat = PatchedDTF;

  for (const fn of ["alert", "confirm", "prompt"] as const) {
    const orig = (window as any)[fn];
    if (typeof orig === "function") (window as any)[fn] = (msg?: any, ...rest: any[]) => orig.call(window, tr(msg), ...rest);
  }
}

// ------------------------------------------------------------------ API
export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  cache.clear();
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {}
  document.documentElement.lang = lang;
  if (lang === "en") startObserver();
  else stopObserver();
  listeners.forEach((l) => l(lang));
}

export function onLangChange(fn: (l: Lang) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** À appeler une fois au démarrage, avant le rendu de l'application. */
export function initI18n() {
  patchRuntime();
  document.documentElement.lang = current;
  if (current === "en") {
    if (document.body) startObserver();
    else document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  }
}
