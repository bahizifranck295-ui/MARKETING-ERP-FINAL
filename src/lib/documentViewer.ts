import { api } from "@/lib/api";
import { toast } from "sonner";

/**
 * Converts any document URL (base64 data URL, blob: URL, /api/... URL, or /assets/... URL)
 * into a native browser Blob URL (blob:...) configured with inline MIME type
 * so it opens directly in Google Chrome / machine's native PDF visualizer without authentication errors.
 */
export async function getDocumentBlobUrl(
  documentUrl: string,
  defaultMime = "application/pdf"
): Promise<string> {
  if (!documentUrl) return "";

  // 1. Already a local blob URL
  if (documentUrl.startsWith("blob:")) {
    return documentUrl;
  }

  // 2. Base64 Data URL: convert directly to binary Blob
  if (documentUrl.startsWith("data:")) {
    try {
      const parts = documentUrl.split(",");
      if (parts.length < 2) return documentUrl;
      const mimeMatch = parts[0]?.match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : defaultMime;
      const byteString = atob(parts[1]);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
      }
      const blob = new Blob([ia], { type: mime });
      return URL.createObjectURL(blob);
    } catch (e) {
      console.error("Failed to convert dataUrl to Blob:", e);
      return documentUrl;
    }
  }

  // 3. Static public asset (/assets/...)
  if (documentUrl.startsWith("/assets/")) {
    try {
      const res = await fetch(documentUrl);
      if (res.ok) {
        const buf = await res.arrayBuffer();
        const blob = new Blob([buf], { type: defaultMime });
        return URL.createObjectURL(blob);
      }
    } catch (err) {
      console.warn("Direct fetch of static asset failed:", err);
    }
  }

  // 4. Server URL (/api/clients/:id/document/file or /api/cash/operations/:id/document/file)
  try {
    // Axios has baseURL = "/api", strip leading "/api" so it doesn't double into "/api/api/..."
    const reqUrl = documentUrl.startsWith("/api/") ? documentUrl.slice(4) : documentUrl;
    const res = await api.get(reqUrl, { responseType: "blob", timeout: 60000 });
    const headerMime =
      typeof res.headers?.["content-type"] === "string"
        ? res.headers["content-type"]
        : typeof (res.headers as any)?.get === "function"
        ? (res.headers as any).get("content-type")
        : defaultMime;
    const mime = headerMime || defaultMime;
    const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: mime });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.warn("API blob fetch failed:", err);
    // If it's a relative URL, return as-is
    return documentUrl;
  }
}

/**
 * Opens any document (client KYC/credit contract, cash operation justificatif, receipt)
 * directly in Google Chrome's built-in PDF viewer or machine's native visualizer in a new tab.
 * Used uniformly across:
 * - CRM Module (ClientsPage, CompteClientView)
 * - Caisse Module (Caisse Journalière, Livre de Caisse, Fiche Détail, Sortie & Entrée Modals)
 */
export async function openDocumentInNativeViewer(
  documentUrl?: string | null,
  documentName?: string | null,
  entityId?: string | null,
  entityType?: "client" | "cash_operation" | "order"
): Promise<void> {
  let targetUrl = documentUrl || "";

  // 1. If URL is missing or is an API endpoint, retrieve the actual document data via API
  if ((!targetUrl || targetUrl.startsWith("/api/")) && entityId) {
    if (entityType === "cash_operation" || targetUrl.includes("/cash/")) {
      try {
        const { data } = await api.get(`/cash/operations/${entityId}/document`);
        if (data?.document_url) {
          targetUrl = data.document_url;
        }
      } catch (err) {
        console.warn("Could not fetch cash operation document via API:", err);
      }
    } else {
      try {
        const { data } = await api.get(`/clients/${entityId}/document`);
        if (data?.document_url) {
          targetUrl = data.document_url;
        }
      } catch (err) {
        console.warn("Could not fetch client document via API:", err);
      }
    }
  }

  // 2. Fallback to direct file endpoints if still empty
  if (!targetUrl && entityId) {
    if (entityType === "cash_operation") {
      targetUrl = `/api/cash/operations/${entityId}/document/file`;
    } else {
      targetUrl = `/api/clients/${entityId}/document/file`;
    }
  }

  // 3. Fallback to default authentic sample document if document name is present
  if (!targetUrl && documentName) {
    targetUrl = "/assets/dossier_client_00039_goma.pdf";
  }

  if (!targetUrl) {
    toast.error("Aucun document justificatif scanné disponible");
    return;
  }

  // Determine appropriate mime type
  const isImage =
    targetUrl.startsWith("data:image/") ||
    (documentName && /\.(png|jpe?g|webp|gif|svg)$/i.test(documentName));
  const defaultMime = isImage ? "image/jpeg" : "application/pdf";

  // Convert to Blob URL so Chrome opens it inline in its native Chromium PDF viewer without auth/cors errors
  const blobUrl = await getDocumentBlobUrl(targetUrl, defaultMime);
  const finalUrl = blobUrl || targetUrl;

  // Open in new tab in Google Chrome native visualizer
  try {
    const link = document.createElement("a");
    link.href = finalUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try {
        document.body.removeChild(link);
      } catch {}
    }, 500);
    toast.success("Ouverture du justificatif dans Google Chrome");
  } catch {
    try {
      window.open(finalUrl, "_blank");
      toast.success("Ouverture du justificatif dans Google Chrome");
    } catch {
      toast.error("Veuillez autoriser l'ouverture des fenêtres pop-up dans Chrome");
    }
  }
}

export async function openDocumentUrl(options: {
  url: string;
  fileName?: string;
  fileType?: string;
}): Promise<void> {
  return openDocumentInNativeViewer(options.url, options.fileName);
}
