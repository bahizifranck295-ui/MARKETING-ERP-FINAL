/*
 * Logo officiel PREMIDIS S.A.R.L. — source unique pour toute l'application.
 * Le fichier public/assets/premidis-logo.png est l'image officielle fournie, copiée sans aucune
 * modification (ni recadrage, ni couleur, ni redimensionnement). Partout — écrans, modes clair et sombre,
 * factures, reçus, rapports et PDF — le logo est affiché depuis ce fichier, seulement mis à l'échelle
 * en conservant ses proportions.
 */
export const LOGO_SRC = "/assets/premidis-logo.png";
export const LOGO_ALT = "PREMIDIS S.A.R.L.";
/**
 * Même image officielle avec le fond blanc retiré (couleurs inchangées), utilisée uniquement pendant
 * l'assemblage des anneaux de l'introduction en mode sombre.
 */
export const LOGO_TRANSPARENT_SRC = "/assets/premidis-logo-transparent.png";
/** Proportions de l'image officielle (1683 × 935 px) */
export const LOGO_RATIO = 1683 / 935;

/** Plus grande taille qui tient dans le cadre (largeur × hauteur) sans déformation */
export function fitLogo(maxW: number, maxH: number) {
  const w = Math.min(maxW, maxH * LOGO_RATIO);
  return { w, h: w / LOGO_RATIO };
}

let cached: Promise<string | null> | null = null;
/** Le fichier officiel lui-même, en data URL PNG, pour les documents générés (jsPDF) */
export function loadLogoDataUrl(): Promise<string | null> {
  if (typeof window === "undefined" || typeof fetch === "undefined") return Promise.resolve(null);
  if (!cached)
    cached = fetch(LOGO_SRC)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("logo"))))
      .then(
        (blob) =>
          new Promise<string>((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result));
            fr.onerror = reject;
            fr.readAsDataURL(blob);
          })
      )
      .catch(() => {
        cached = null;
        return null;
      });
  return cached;
}

/**
 * Place le logo dans un cadre d'un document jsPDF : mis à l'échelle sans déformation,
 * centré verticalement dans le cadre, aligné à gauche. Retourne la largeur réellement occupée.
 */
export function drawLogo(doc: any, dataUrl: string, x: number, y: number, maxW: number, maxH: number) {
  const { w, h } = fitLogo(maxW, maxH);
  doc.addImage(dataUrl, "PNG", x, y + (maxH - h) / 2, w, h, "premidis-logo", "FAST");
  return w;
}
