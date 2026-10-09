import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import { CalendarDays, FileText, Loader2 } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { fmtMoney } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { closeTab, openPendingTab, presentDocument } from "@/lib/documentViewer";
import { useAuth } from "@/contexts/AuthContext";

/*
 * Rapport des ventes : fiches de commande (de livraison) par catégorie de produits,
 * au format des fiches papier PREMIDIS, alimentées par les commandes approuvées.
 * Une colonne par produit de la catégorie (un nouveau produit ajoute sa colonne).
 * Journalier : fiche du jour choisi. Mensuel : fiche récapitulative du mois. Pas d'annuel.
 */

type SheetKey = "eau" | "whisky_local" | "whisky_india" | "mais" | "vin" | "generic";

type SheetDef = {
  key: SheetKey;
  label: string; // nom de la catégorie (onglet)
  title: (products: any[]) => string;
  subtitle?: string;
  clientLabel: string;
  marketer: boolean;
  units?: boolean; // colonne « Units » (Crts)
  total?: boolean; // colonne TOTAL par ligne
  bonus?: string; // libellé de la colonne bonus
  footer: string[]; // lignes de total en bas de fiche
  depot: string; // signature de droite
};

// Les cinq fiches de PREMIDIS, d'après les modèles papier
const SHEETS: SheetDef[] = [
  {
    key: "eau",
    label: "Catégorie eau",
    title: () => "FICHE DE LIVRAISON : LAVIE / PREMIDIS",
    clientLabel: "Nom du client",
    marketer: true,
    footer: ["S/TOTAL", "TOTAL G"],
    depot: "DEPOT CHANCE",
  },
  {
    key: "whisky_local",
    label: "Whisky local",
    title: () => "FICHE DE LIVRAISON / VENTE WHISKY",
    clientLabel: "Clients",
    marketer: true,
    total: true,
    bonus: "Carton/Bonus",
    footer: ["TOTAL"],
    depot: "DEPOT CHANCE",
  },
  {
    key: "whisky_india",
    label: "Whisky India",
    title: () => "FICHE DE LIVRAISON / VENTE WHISKY IMPORTES",
    clientLabel: "Nom du client",
    marketer: true,
    footer: ["TOTAL"],
    depot: "DEPOT CHANCE",
  },
  {
    key: "mais",
    label: "Maïs",
    title: () => "FICHE DE LIVRAISON / VENTE MAÏS",
    clientLabel: "Nom du client",
    marketer: true,
    total: true,
    footer: ["TOTAL"],
    depot: "DEPOT CHANCE",
  },
  {
    key: "vin",
    label: "Vin",
    title: (products) => `FICHE DE LIVRAISON ${products.length === 1 ? products[0].name.toUpperCase() : "VIN"}`,
    subtitle: "Premidis sarl · Wine department",
    clientLabel: "Nom du client",
    marketer: true,
    units: true,
    bonus: "Bonus",
    footer: ["TOTAL GENERAL"],
    depot: "DEPOT IN CHARGE",
  },
];

// Catégorie sans modèle papier : fiche au format commun
const genericSheet = (category: string): SheetDef => ({
  key: "generic",
  label: category,
  title: () => `FICHE DE LIVRAISON / VENTE ${category.toUpperCase()}`,
  clientLabel: "Nom du client",
  marketer: true,
  total: true,
  footer: ["TOTAL"],
  depot: "DEPOT CHANCE",
});

const strip = (s: string) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

// Catégorie de produits (Stock › Catégories) → fiche
export function sheetOfCategory(category?: string): SheetKey | null {
  const c = strip(category || "");
  if (!c) return null;
  if (c.includes("india") || c.includes("import")) return "whisky_india";
  if (c.includes("whisky")) return "whisky_local";
  if (/\bmais\b/.test(c)) return "mais";
  if (c === "vin" || c.startsWith("vin ") || c.includes("wine") || c.includes(" vin")) return "vin";
  if (/\beau\b/.test(c)) return "eau";
  return null;
}

const APPROVED = ["validated", "prepared", "shipped", "delivered"];
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayKey = () => dayKey(new Date());
const fmtQty = (n: number) => (n ? n.toLocaleString("fr-FR") : "");

type Row = { key: string; client: string; marketer: string; qty: Record<string, number>; bonus: number; amount: number; total: number };

export default function SalesSheets({
  search = "",
  period: reportPeriod,
  includeOrder,
  siteKey,
}: {
  search?: string;
  period?: string;
  includeOrder?: (o: any) => boolean; // filtre par site du module Rapports
  siteKey?: string;
}) {
  const [orders, setOrders] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  // « Prepared by » : l'utilisateur qui établit / exporte la fiche
  const preparedBy = user?.full_name || "Utilisateur";
  // Fiches = catégories créées dans Stock › Catégories
  const [categories, setCategories] = useState<string[]>([]);
  const [cat, setCat] = useState("");
  const [period, setPeriod] = useState<"day" | "month">("day");
  const [day, setDay] = useState(todayKey());
  const [month, setMonth] = useState(todayKey().slice(0, 7));
  const [exporting, setExporting] = useState(false);

  // Filtre de période du module Rapports : Aujourd'hui → fiche du jour, Ce mois → fiche mensuelle
  useEffect(() => {
    if (reportPeriod === "day") {
      setPeriod("day");
      setDay(todayKey());
    } else if (reportPeriod === "month") {
      setPeriod("month");
      setMonth(todayKey().slice(0, 7));
    }
  }, [reportPeriod]);

  const load = async (silent = false) => {
    try {
      const [o, p, c] = await Promise.all([api.get("/orders"), api.get("/products"), api.get("/stock/categories")]);
      setOrders(Array.isArray(o.data) ? o.data : []);
      setProducts(Array.isArray(p.data) ? p.data : []);
      const names = (Array.isArray(c.data) ? c.data : []).map((x: any) => String(x.name || x)).filter(Boolean);
      setCategories(names);
      setCat((cur) => (cur && names.some((n: string) => strip(n) === strip(cur)) ? cur : names[0] || ""));
    } catch (err) {
      if (!silent) toast.error(extractErrorMessage(err, "Erreur de chargement des fiches"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
    // Temps réel : une commande approuvée apparaît sans recharger la page
    const t = window.setInterval(() => document.visibilityState !== "hidden" && load(true), 15000);
    return () => window.clearInterval(t);
  }, []);

  // Modèle de fiche d'après le nom de la catégorie (eau, whisky, whisky India, maïs, vin), sinon format commun
  const template = SHEETS.find((s) => s.key === sheetOfCategory(cat));
  // Pas de colonne Total ni Bonus par ligne : les totaux sont calculés en bas de la fiche
  const sheet: SheetDef = { ...(template ? { ...template, label: cat } : genericSheet(cat)), total: false, bonus: undefined };
  const sheetKey = cat;
  const productSheet = useMemo(() => new Map(products.map((p) => [p.id, p.category ? categories.find((n) => strip(n) === strip(p.category)) || null : null])), [products, categories]);

  // Colonnes : chaque produit de la catégorie (actif ou présent dans une commande de la période)
  const inPeriod = (o: any) => {
    const k = dayKey(new Date(o.approved_at || o.created_at));
    return period === "day" ? k === day : k.slice(0, 7) === month;
  };
  const periodOrders = useMemo(
    () => orders.filter((o) => APPROVED.includes(o.status) && inPeriod(o) && (!includeOrder || includeOrder(o))),
    [orders, period, day, month, siteKey, includeOrder]
  );
  const columns = useMemo(() => {
    const ids = new Set(products.filter((p) => p.is_active !== false && productSheet.get(p.id) === sheetKey).map((p) => p.id));
    periodOrders.forEach((o) => (o.items || []).forEach((it: any) => productSheet.get(it.product_id) === sheetKey && ids.add(it.product_id)));
    return Array.from(ids)
      .map((id) => products.find((p) => p.id === id) || { id, name: "Produit" })
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name), "fr"));
  }, [products, productSheet, sheetKey, periodOrders]);

  // Lignes : une par commande (journalier) ou une par client et marketeur (récapitulatif mensuel)
  const rows = useMemo(() => {
    const map = new Map<string, Row>();
    periodOrders.forEach((o) => {
      const items = (o.items || []).filter((it: any) => productSheet.get(it.product_id) === sheetKey);
      if (!items.length) return;
      const key = period === "day" ? o.id : `${o.client_name}|${o.marketer_name}`;
      const r: Row = map.get(key) || { key, client: o.client_name, marketer: o.marketer_name || "-", qty: {} as Record<string, number>, bonus: 0, amount: 0, total: 0 };
      items.forEach((it: any) => {
        const q = Number(it.quantity) || 0;
        r.qty[it.product_id] = (r.qty[it.product_id] || 0) + q;
        r.total += q;
        r.bonus += Number(it.bonus_qty) || 0;
        r.amount += Number(it.line_total) || q * (Number(it.unit_price) || 0);
      });
      map.set(key, r);
    });
    const q = search.trim().toLowerCase();
    return Array.from(map.values()).filter((r) => !q || r.client.toLowerCase().includes(q) || r.marketer.toLowerCase().includes(q));
  }, [periodOrders, productSheet, sheetKey, period, search]);

  const colTotal = (id: string) => rows.reduce((s, r) => s + (r.qty[id] || 0), 0);
  const grandQty = rows.reduce((s, r) => s + r.total, 0);
  const grandBonus = rows.reduce((s, r) => s + r.bonus, 0);
  const grandAmount = rows.reduce((s, r) => s + r.amount, 0);
  const periodLabel =
    period === "day"
      ? new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
      : new Date(`${month}-15T12:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const minRows = period === "day" ? Math.max(rows.length, 8) : rows.length;

  const headers = [
    "N°",
    sheet.clientLabel,
    ...(sheet.units ? ["Units"] : []),
    ...(sheet.marketer ? ["Marketeur"] : []),
    ...(sheet.key === "vin" && columns.length === 1 ? ["Nbre de carton"] : columns.map((p: any) => p.name)),
    ...(sheet.total ? ["Total"] : []),
    ...(sheet.bonus ? [sheet.bonus] : []),
  ];
  const cellsOf = (r: Row, i: number) => [
    String(i + 1),
    r.client,
    ...(sheet.units ? ["Crts"] : []),
    ...(sheet.marketer ? [r.marketer] : []),
    ...columns.map((p: any) => fmtQty(r.qty[p.id] || 0)),
    ...(sheet.total ? [fmtQty(r.total)] : []),
    ...(sheet.bonus ? [fmtQty(r.bonus) || "-"] : []),
  ];
  const lead = 2 + (sheet.units ? 1 : 0) + (sheet.marketer ? 1 : 0);
  const totalCells = (label: string) =>
    label === "TOTAL G"
      ? [label, ...Array(lead - 1).fill(""), fmtQty(grandQty), ...Array(Math.max(0, columns.length - 1)).fill("")]
      : [
          label,
          ...Array(lead - 1).fill(""),
          ...columns.map((p: any) => fmtQty(colTotal(p.id))),
          ...(sheet.total ? [fmtQty(grandQty)] : []),
          ...(sheet.bonus ? [fmtQty(grandBonus) || "-"] : []),
        ];

  const exportPdf = async () => {
    const tab = openPendingTab(sheet.title(columns));
    setExporting(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const W = doc.internal.pageSize.getWidth();
      const H = doc.internal.pageSize.getHeight();
      const M = 10;
      const INK: [number, number, number] = [15, 61, 104];
      const draw = (first: boolean) => {
        doc.setTextColor(...INK);
        if (sheet.subtitle) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.text(sheet.subtitle, M, 10);
        }
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.text(sheet.title(columns), W / 2, 16, { align: "center" });
        doc.setFontSize(9);
        doc.text(`${period === "day" ? "JOUR / DATE" : "MOIS"} : ${periodLabel}${period === "month" ? " (fiche récapitulative)" : ""}`, W - M, 16, { align: "right" });
        if (!first) doc.text("(suite)", M, 16);
      };
      draw(true);
      const widths: number[] = headers.map((h, i) => (i === 0 ? 10 : i === 1 ? 46 : h === "Marketeur" ? 36 : h === "Units" ? 14 : 0));
      const free = W - 2 * M - widths.reduce((s, w) => s + w, 0);
      const flexible = widths.filter((w) => !w).length || 1;
      const cw = widths.map((w) => w || free / flexible);
      let y = 22;
      const line = (cells: string[], bold = false, fill?: [number, number, number]) => {
        const h = 7;
        if (y + h > H - 22) {
          doc.addPage();
          draw(false);
          y = 22;
        }
        if (fill) {
          doc.setFillColor(...fill);
          doc.rect(M, y, W - 2 * M, h, "F");
        }
        doc.setDrawColor(120, 130, 145);
        doc.setLineWidth(0.2);
        let x = M;
        cells.forEach((c, i) => {
          doc.rect(x, y, cw[i], h);
          doc.setFont("helvetica", bold ? "bold" : "normal");
          doc.setFontSize(8);
          doc.setTextColor(15, 23, 42);
          const t = (doc.splitTextToSize(String(c), cw[i] - 2) as string[])[0] || "";
          doc.text(t, i <= 1 || headers[i] === "Marketeur" ? x + 1.5 : x + cw[i] / 2, y + 4.7, { align: i <= 1 || headers[i] === "Marketeur" ? "left" : "center" });
          x += cw[i];
        });
        y += h;
      };
      line(headers.map((h) => h.toUpperCase()), true, [219, 234, 254]);
      rows.forEach((r, i) => line(cellsOf(r, i)));
      for (let i = rows.length; i < minRows; i++) line([String(i + 1), ...Array(headers.length - 1).fill("")]);
      sheet.footer.forEach((f) => line(totalCells(f).slice(0, headers.length).concat(Array(Math.max(0, headers.length - totalCells(f).length)).fill("")), true, [241, 245, 249]));
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`Montant total des commandes : ${fmtMoney(grandAmount).replace(/[  ]/g, " ")}`, M, y + 6);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`PREPARED BY : ${preparedBy}`, M, H - 10);
      doc.text("MARKETING OFFICER", W / 2, H - 10, { align: "center" });
      doc.text(sheet.depot, W - M, H - 10, { align: "right" });
      const name = `Fiche_${sheet.label.replace(/\s+/g, "_")}_${period === "day" ? day : month}.pdf`;
      if (!(await presentDocument(doc.output("blob"), name, tab))) closeTab(tab);
    } catch (err) {
      closeTab(tab);
      toast.error(extractErrorMessage(err, "Export PDF impossible"));
    } finally {
      setExporting(false);
    }
  };

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );

  return (
    <div className="space-y-3">
      {/* Fiches par catégorie */}
      <div role="tablist" aria-label="Fiches par catégorie" className="flex flex-wrap gap-1.5">
        {categories.map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={name === cat}
            onClick={() => setCat(name)}
            className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
              name === cat ? "bg-[#0F3D68] text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {name}
          </button>
        ))}
        {!categories.length && <span className="text-xs text-slate-500">Aucune catégorie : créez-en dans Stock › Catégories.</span>}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-0.5" role="group" aria-label="Période">
          {[
            { v: "day" as const, l: "Journalier" },
            { v: "month" as const, l: "Mensuel" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              aria-pressed={period === o.v}
              onClick={() => setPeriod(o.v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${period === o.v ? "bg-[#0F3D68] text-white" : "text-slate-600"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
          <CalendarDays className="h-4 w-4 text-[#0F3D68]" />
          {period === "day" ? (
            <input aria-label="Jour de la fiche" type="date" value={day} max={todayKey()} onChange={(e) => e.target.value && setDay(e.target.value)} className="h-9 rounded-xl border border-slate-200 px-2.5 text-xs" />
          ) : (
            <input aria-label="Mois de la fiche" type="month" value={month} max={todayKey().slice(0, 7)} onChange={(e) => e.target.value && setMonth(e.target.value)} className="h-9 rounded-xl border border-slate-200 px-2.5 text-xs" />
          )}
        </label>
        <Button size="sm" onClick={exportPdf} disabled={exporting} className="ml-auto rounded-xl bg-[#0F3D68] text-xs text-white hover:bg-[#0B2F52]">
          {exporting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />} Exporter la fiche en PDF
        </Button>
      </div>

      {/* La fiche, au format papier */}
      <div className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xs">
        <div className="border-b border-slate-300 px-4 py-3">
          {sheet.subtitle && <div className="text-[11px] font-semibold text-slate-500">{sheet.subtitle}</div>}
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-base font-black tracking-wide text-[#0F3D68]">{sheet.title(columns)}</h3>
            <span className="text-xs font-semibold text-slate-600">
              {period === "day" ? "Jour / Date" : "Mois"} : <span className="capitalize">{periodLabel}</span>
              {period === "month" && <span className="ml-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">Fiche récapitulative</span>}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="bg-blue-50 text-[11px] uppercase text-[#0F3D68]">
                {headers.map((h, i) => (
                  <th key={i} className={`border border-slate-300 px-2 py-2 font-bold ${i <= 1 || h === "Marketeur" ? "text-left" : "text-center"}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.key} className="hover:bg-slate-50">
                  {cellsOf(r, i).map((c, k) => (
                    <td key={k} className={`border border-slate-300 px-2 py-1.5 ${k <= 1 || headers[k] === "Marketeur" ? "text-left" : "text-center tabular-nums"} ${k === 1 ? "font-semibold text-slate-900" : "text-slate-700"}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
              {Array.from({ length: minRows - rows.length }).map((_, i) => (
                <tr key={`empty-${i}`}>
                  {headers.map((_, k) => (
                    <td key={k} className="h-7 border border-slate-300 px-2 text-slate-300">
                      {k === 0 ? rows.length + i + 1 : ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot>
              {sheet.footer.map((f) => {
                const cells = totalCells(f);
                return (
                  <tr key={f} className="bg-slate-100 font-bold text-slate-900">
                    {headers.map((_, k) => (
                      <td key={k} className={`border border-slate-300 px-2 py-1.5 ${k === 0 ? "text-left" : "text-center tabular-nums"}`}>
                        {cells[k] ?? ""}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-300 px-4 py-2.5 text-[11px] font-bold uppercase text-slate-600">
          <span>
            Prepared by : <span className="normal-case text-slate-900">{preparedBy}</span>
          </span>
          <span>Marketing officer</span>
          <span>{sheet.depot}</span>
        </div>
      </div>
      <p className="text-[11px] text-slate-500">
        {rows.length} commande(s) approuvée(s) · montant total {fmtMoney(grandAmount)} · mise à jour automatique toutes les 15 secondes.
        {!columns.length && " Aucun produit n'est encore classé dans cette catégorie (Stock › Catégories)."}
      </p>
    </div>
  );
}
