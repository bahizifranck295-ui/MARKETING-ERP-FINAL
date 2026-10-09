import { api } from "@/lib/api";
import { toast } from "sonner";

/*
 * Visualisation et téléchargement des documents (règle unique pour toute l'application).
 *
 * - Visualiser / Ouvrir : le fichier réel est chargé en Blob puis ouvert dans un
 *   nouvel onglet, où Chrome l'affiche avec son visualiseur natif (PDF, images).
 *   L'onglet est ouvert dès le clic (sinon Chrome bloque la fenêtre), puis dirigé
 *   vers le document une fois prêt. Un format que Chrome n'affiche pas
 *   (Word…) est téléchargé.
 * - Télécharger / Exporter : le fichier réel est enregistré sur la machine.
 * - Aperçu Claude (page encadrée par claude.ai) : l'aperçu interdit les
 *   téléchargements directs et l'ouverture d'un document dans un autre onglet ;
 *   le fichier passe alors par la fonction d'enregistrement de l'aperçu.
 * - Les notifications de réussite ne s'affichent qu'après la réussite réelle.
 */

const VIEWABLE_MIME = /^(application\/pdf|image\/(png|jpe?g|gif|webp|svg\+xml)|text\/plain)$/i;

const MIME_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  csv: "text/csv",
  txt: "text/plain",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const EXT_BY_MIME: Record<string, string> = Object.fromEntries(Object.entries(MIME_BY_EXT).map(([e, m]) => [m, e]));

function mimeFromName(name?: string | null, fallback = "application/pdf") {
  const ext = String(name || "").split(".").pop()?.toLowerCase() || "";
  return MIME_BY_EXT[ext] || fallback;
}

/** Nom de fichier avec une extension cohérente avec le contenu. */
function fileNameFor(name: string | null | undefined, mime: string) {
  const base = String(name || "Document").trim() || "Document";
  if (/\.[a-z0-9]{2,5}$/i.test(base)) return base;
  return `${base.replace(/[\\/:*?"<>|]+/g, "_")}.${EXT_BY_MIME[mime] || "pdf"}`;
}

/** Vrai lorsque l'application tourne dans l'aperçu Claude (page encadrée par claude.ai). */
export function isClaudePreview(): boolean {
  try {
    const framed = window.top !== window.self;
    return framed && typeof (window as any).claude?.use === "function";
  } catch {
    return typeof (window as any).claude?.use === "function";
  }
}

/**
 * Charge le contenu réel d'un document (data:, blob:, fichier statique ou API)
 * et renvoie un Blob typé. Lève une erreur si le document est introuvable.
 */
export async function resolveDocumentBlob(documentUrl: string, nameHint?: string | null): Promise<Blob> {
  if (!documentUrl) throw new Error("Aucun document");
  const hintMime = mimeFromName(nameHint, "");

  if (documentUrl.startsWith("data:")) {
    const comma = documentUrl.indexOf(",");
    if (comma < 0) throw new Error("Document illisible");
    const header = documentUrl.slice(5, comma);
    const mime = header.split(";")[0] || hintMime || "application/pdf";
    const payload = documentUrl.slice(comma + 1);
    if (/;base64/i.test(header)) {
      const bin = atob(payload);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new Blob([bytes], { type: mime });
    }
    return new Blob([decodeURIComponent(payload)], { type: mime });
  }

  if (documentUrl.startsWith("/api/")) {
    const res = await api.get(documentUrl.slice(4), { responseType: "blob", timeout: 60000 });
    const data = res.data instanceof Blob ? res.data : new Blob([res.data]);
    const type = (data.type && data.type !== "application/octet-stream" ? data.type : "") || hintMime || "application/pdf";
    if (/text\/html|application\/json/i.test(type) && !/html|json$/i.test(String(nameHint))) throw new Error("Document introuvable");
    return new Blob([data], { type });
  }

  // blob:, fichiers statiques (/assets/…, ./assets/…) et URL absolues
  const res = await fetch(documentUrl);
  if (!res.ok) throw new Error(`Document introuvable (${res.status})`);
  const served = (res.headers.get("content-type") || "").split(";")[0].trim();
  // Une page HTML renvoyée à la place d'un fichier = document absent
  if (served === "text/html" && hintMime !== "text/html" && !documentUrl.startsWith("blob:")) throw new Error("Document introuvable");
  const buf = await res.arrayBuffer();
  const type = served && served !== "application/octet-stream" ? served : hintMime || "application/pdf";
  return new Blob([buf], { type });
}

async function claudeDownloads(): Promise<any | null> {
  try {
    return await (window as any).claude.use("downloads");
  } catch {
    return null;
  }
}

/**
 * Enregistre réellement un fichier sur la machine de l'utilisateur.
 * Renvoie true seulement si le téléchargement a bien été déclenché / accepté.
 */
export async function saveFile(data: Blob | string, fileName: string, opts: { silent?: boolean } = {}): Promise<boolean> {
  let blob: Blob;
  try {
    blob = typeof data === "string" ? await resolveDocumentBlob(data, fileName) : data;
    if (!blob.size) throw new Error("Fichier vide");
  } catch (err: any) {
    toast.error(`Téléchargement impossible : ${err?.message || "fichier introuvable"}`);
    return false;
  }
  const name = fileNameFor(fileName, blob.type);

  if (isClaudePreview()) {
    const downloads = await claudeDownloads();
    if (!downloads) {
      toast.error("L'aperçu Claude n'autorise pas l'enregistrement de fichiers ici.");
      return false;
    }
    try {
      const r = await downloads.save({ filename: name, data: blob });
      if (r?.status === "saved") {
        if (!opts.silent) toast.success(`Fichier enregistré : ${name}`);
        return true;
      }
      return false;
    } catch (err: any) {
      if (err?.code === "declined") toast.info("Enregistrement annulé.");
      else if (err?.code === "rejected_extension" || err?.code === "extension_not_enabled") toast.error(`Format non autorisé par l'aperçu Claude : ${name}`);
      else toast.error(`Enregistrement impossible (${err?.code || "erreur"}).`);
      return false;
    }
  }

  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    if (!opts.silent) toast.success(`Téléchargement lancé : ${name}`);
    return true;
  } catch {
    toast.error("Le navigateur a refusé le téléchargement.");
    return false;
  }
}

/**
 * Ouvre immédiatement (pendant le clic) l'onglet qui recevra le document.
 * Renvoie null dans l'aperçu Claude ou si Chrome bloque la fenêtre.
 */
export function openPendingTab(title = "Document"): Window | null {
  if (isClaudePreview()) return null;
  try {
    const tab = window.open("", "_blank");
    if (tab) {
      tab.document.title = title;
      tab.document.body.innerHTML =
        '<p style="font-family:system-ui,sans-serif;color:#211A5C;padding:24px">Chargement du document…</p>';
    }
    return tab;
  } catch {
    return null;
  }
}

/** Referme un onglet préparé qui n'a finalement rien reçu. */
export function closeTab(tab: Window | null | undefined) {
  try {
    if (tab && !tab.closed && tab.location.href === "about:blank") tab.close();
  } catch {}
}

/**
 * Affiche un document déjà chargé : nouvel onglet avec le visualiseur natif de
 * Chrome si le format s'y prête, sinon téléchargement réel.
 */
export async function presentDocument(blob: Blob, fileName: string, tab: Window | null = null): Promise<boolean> {
  const name = fileNameFor(fileName, blob.type);
  const viewable = VIEWABLE_MIME.test(blob.type);

  if (isClaudePreview() || !viewable) {
    try {
      tab?.close();
    } catch {}
    if (isClaudePreview() && viewable)
      toast.info("Dans l'aperçu Claude, les documents ne peuvent pas s'ouvrir dans un autre onglet : enregistrez-le pour l'ouvrir dans Chrome.");
    return saveFile(blob, name);
  }

  const url = URL.createObjectURL(blob);
  if (tab && !tab.closed) {
    tab.location.href = url;
    toast.success(`${name} ouvert dans un nouvel onglet`);
    return true;
  }
  // Fenêtre bloquée : on propose l'ouverture sur un nouveau clic (geste utilisateur)
  const opened = window.open(url, "_blank");
  if (opened) {
    toast.success(`${name} ouvert dans un nouvel onglet`);
    return true;
  }
  toast(`${name} est prêt`, {
    description: "Chrome a bloqué l'ouverture automatique.",
    duration: 20000,
    action: {
      label: "Ouvrir",
      onClick: () => {
        if (!window.open(url, "_blank")) toast.error("Autorisez les fenêtres pop-up pour ce site dans Chrome.");
      },
    },
  });
  return false;
}

/**
 * Visualiser / Ouvrir un document (justificatif, dossier client, bordereau, facture…).
 */
export async function openDocumentInNativeViewer(
  documentUrl?: string | null,
  documentName?: string | null,
  entityId?: string | null,
  entityType?: "client" | "cash_operation" | "order"
): Promise<boolean> {
  // L'onglet doit être ouvert pendant le clic, avant toute attente
  const tab = openPendingTab(documentName || "Document");
  let targetUrl = documentUrl || "";

  try {
    // Document stocké côté serveur : on récupère son contenu réel
    if ((!targetUrl || targetUrl.startsWith("/api/")) && entityId) {
      if (entityType === "cash_operation" || targetUrl.includes("/cash/")) {
        const { data } = await api.get(`/cash/operations/${entityId}/document`);
        targetUrl = data?.document_url || "";
      } else {
        const { data } = await api.get(`/clients/${entityId}`);
        targetUrl = data?.document_url || "";
      }
    }
    if (!targetUrl) throw new Error("Aucun document disponible");
    const blob = await resolveDocumentBlob(targetUrl, documentName);
    return await presentDocument(blob, documentName || "Document", tab);
  } catch (err: any) {
    try {
      tab?.close();
    } catch {}
    toast.error(err?.message === "Aucun document disponible" ? "Aucun document disponible pour cet élément." : `Impossible d'ouvrir le document : ${err?.message || "introuvable"}`);
    return false;
  }
}

export async function openDocumentUrl(options: { url: string; fileName?: string; fileType?: string }): Promise<boolean> {
  return openDocumentInNativeViewer(options.url, options.fileName);
}

/** @deprecated conservé pour compatibilité : renvoie une URL blob du document réel. */
export async function getDocumentBlobUrl(documentUrl: string, defaultMime = "application/pdf"): Promise<string> {
  const blob = await resolveDocumentBlob(documentUrl, `document.${EXT_BY_MIME[defaultMime] || "pdf"}`);
  return URL.createObjectURL(blob);
}
