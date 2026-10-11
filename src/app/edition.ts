/*
 * Deux applications sur le même code et la même base de données :
 *  - « commercial »  : Boutique, Commandes, CRM, Caisse, Crédits, Comptabilité, Rapports commerciaux,
 *                      Objectifs, Administration (projet principal, par défaut) ;
 *  - « logistique »  : Stock, Livraison et leurs rapports.
 * L'application est choisie à la compilation : VITE_ERP_APP=logistique (sinon commercial).
 * Les échanges entre les deux passent par les routes /integration/* (voir src/server/integration.ts).
 */
export type ErpApp = "commercial" | "logistique";

export const ERP_APP: ErpApp = import.meta.env.VITE_ERP_APP === "logistique" ? "logistique" : "commercial";
export const IS_COMMERCIAL = ERP_APP === "commercial";
export const IS_LOGISTICS = ERP_APP === "logistique";

export const APP_INFO = IS_LOGISTICS
  ? { name: "Stock & Livraison", subtitle: "Dépôts, transferts, tournées et rapports logistiques" }
  : { name: "Gestion commerciale", subtitle: "Ventes, caisse, crédits, comptabilité et objectifs" };

/** Permission d'accès au module Rapports : chaque application a ses propres rapports */
export const REPORTS_PERM = IS_LOGISTICS ? "logistics_reports.read" : "reports.read";

// Modules (routes) appartenant à chaque application
const COMMERCIAL_ROUTES = ["/boutique", "/orders", "/clients", "/cash", "/credits", "/accounting", "/objectives", "/admin"];
const LOGISTICS_ROUTES = ["/stock", "/delivery", "/admin/roles"];
// Communs aux deux : tableau de bord, rapports (propres à chaque application), notifications, profil
const SHARED_ROUTES = ["/dashboard", "/reports", "/notifications", "/profile", "/more"];

/** Le module de cette route appartient-il à l'application en cours ? */
export function inThisApp(path: string) {
  const match = (list: string[]) => list.some((p) => path === p || path.startsWith(p + "/"));
  if (match(SHARED_ROUTES)) return true;
  return IS_LOGISTICS ? match(LOGISTICS_ROUTES) : match(COMMERCIAL_ROUTES);
}

/*
 * Site unique : l'entreprise travaille pour l'instant avec un seul site (Goma, Nord-Kivu).
 * Tant que ce drapeau est à false, l'interface n'affiche aucune gestion par site (sélecteurs,
 * colonnes, filtres, périmètre « sites ») ; le code reste en place et le serveur rattache tout au
 * site principal. Passer à true pour réactiver la gestion multi-sites.
 */
export const MULTI_SITE = false;
