import React, { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Building2,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  FileUp,
  FolderOpen,
  History,
  Loader2,
  MapPin,
  Package,
  Trash2,
  Upload,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { GlassCard, fieldCls, fmtDateTime, stockStatus } from "@/components/stock/ui";
import { ExportTable, downloadDataUrl, exportCsv, exportPdf } from "@/components/stock/stockExports";

const ACCEPT = ".pdf,.xlsx,.xls,.docx,.doc,.csv";
const DOC_CATEGORIES = ["Inventaire", "Rapport mensuel", "Bon de transfert", "Modèle", "Autre"];
const MAX_BYTES = 5 * 1024 * 1024;

const money = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const thresholdOf = (p: any) => Number(p.low_stock_threshold ?? p.alert_threshold) || 0;

async function fetchAll() {
  const [products, sites, depots, levels, transfers, movements] = await Promise.all(
    ["/products", "/stock/sites", "/stock/depots", "/stock/levels", "/stock/transfers", "/stock/movements"].map((u) =>
      api.get(u).then((r) => (Array.isArray(r.data) ? r.data : []))
    )
  );
  return { products, sites, depots, levels, transfers, movements };
}

// Chaque rapport est construit à partir des données du moment (temps réel)
const REPORTS: Array<{ id: string; title: string; description: string; icon: any; build: (d: Awaited<ReturnType<typeof fetchAll>>) => ExportTable }> = [
  {
    id: "global",
    title: "État du stock global",
    description: "Tous les produits : stock total, seuil, valeur, statut.",
    icon: Package,
    build: ({ products }) => {
      const rows = [...products]
        .sort((a, b) => a.name.localeCompare(b.name, "fr"))
        .map((p) => [p.code, p.name, p.size || "", p.category || "", p.stock || 0, thresholdOf(p), money(p.cost_price), money((p.stock || 0) * (p.cost_price || 0)), stockStatus(p.stock || 0, thresholdOf(p)).label]);
      const total = rows.reduce((s, r) => s + Number(r[7]), 0);
      return {
        title: "État du stock global",
        subtitle: `${products.length} produit(s)`,
        fileBase: "Etat_stock_global",
        columns: [
          { label: "Code", width: 1.2 },
          { label: "Produit", width: 2.4 },
          { label: "Taille", width: 0.8 },
          { label: "Catégorie", width: 1.2 },
          { label: "Stock", width: 0.8, align: "right" },
          { label: "Seuil", width: 0.7, align: "right" },
          { label: "Prix achat ($)", width: 1, align: "right" },
          { label: "Valeur ($)", width: 1.1, align: "right" },
          { label: "Statut", width: 1 },
        ],
        rows,
        totals: ["", "TOTAL", "", "", rows.reduce((s, r) => s + Number(r[4]), 0), "", "", money(total), ""],
      };
    },
  },
  {
    id: "depots",
    title: "Stock par dépôt",
    description: "Chaque dépôt avec ses produits, quantités et emplacements.",
    icon: Building2,
    build: ({ products, depots, levels }) => {
      const pById = new Map(products.map((p: any) => [p.id, p]));
      const dById = new Map(depots.map((d: any) => [d.id, d]));
      const rows = levels
        .filter((l: any) => pById.has(l.product_id) && dById.has(l.warehouse_id))
        .map((l: any) => {
          const p: any = pById.get(l.product_id);
          const d: any = dById.get(l.warehouse_id);
          return [d.site_name, d.name, p.name, p.size || "", p.category || "", l.quantity, l.location_ref || "", money(l.quantity * (p.cost_price || 0)), stockStatus(l.quantity, thresholdOf(p)).label];
        })
        .sort((a: any, b: any) => `${a[0]}${a[1]}${a[2]}`.localeCompare(`${b[0]}${b[1]}${b[2]}`, "fr"));
      return {
        title: "Stock par dépôt",
        subtitle: `${depots.length} dépôt(s)`,
        fileBase: "Stock_par_depot",
        columns: [
          { label: "Site", width: 1 },
          { label: "Dépôt", width: 1.5 },
          { label: "Produit", width: 2.2 },
          { label: "Taille", width: 0.8 },
          { label: "Catégorie", width: 1.1 },
          { label: "Quantité", width: 0.9, align: "right" },
          { label: "Emplacement", width: 1 },
          { label: "Valeur ($)", width: 1, align: "right" },
          { label: "Statut", width: 1 },
        ],
        rows,
        totals: ["TOTAL", "", "", "", "", rows.reduce((s: number, r: any) => s + Number(r[5]), 0), "", money(rows.reduce((s: number, r: any) => s + Number(r[7]), 0)), ""],
      };
    },
  },
  {
    id: "sites",
    title: "Stock par site",
    description: "Synthèse par site : dépôts, produits, quantités, valeur.",
    icon: MapPin,
    build: ({ sites }) => {
      const rows = sites.map((s: any) => [s.code, s.name, s.location || "", s.is_active === false ? "Inactif" : "Actif", s.depot_count, s.product_count, s.quantity, money(s.value)]);
      return {
        title: "Stock par site",
        subtitle: `${sites.length} site(s)`,
        fileBase: "Stock_par_site",
        columns: [
          { label: "Code", width: 1 },
          { label: "Site", width: 1.4 },
          { label: "Localisation", width: 1.8 },
          { label: "Statut", width: 0.8 },
          { label: "Dépôts", width: 0.7, align: "right" },
          { label: "Produits", width: 0.8, align: "right" },
          { label: "Quantité", width: 0.9, align: "right" },
          { label: "Valeur ($)", width: 1.1, align: "right" },
        ],
        rows,
        totals: ["", "TOTAL", "", "", rows.reduce((s: number, r: any) => s + Number(r[4]), 0), "", rows.reduce((s: number, r: any) => s + Number(r[6]), 0), money(rows.reduce((s: number, r: any) => s + Number(r[7]), 0))],
      };
    },
  },
  {
    id: "transfers",
    title: "Historique des transferts",
    description: "Date, produit, quantité, source, destination, utilisateur.",
    icon: ArrowRightLeft,
    build: ({ transfers }) => ({
      title: "Historique des transferts",
      subtitle: `${transfers.length} transfert(s)`,
      fileBase: "Transferts_stock",
      columns: [
        { label: "Date", width: 1.3 },
        { label: "Référence", width: 1.1 },
        { label: "Produit", width: 1.8 },
        { label: "Quantité", width: 0.8, align: "right" },
        { label: "Source", width: 1.7 },
        { label: "Destination", width: 1.7 },
        { label: "Utilisateur", width: 1.3 },
        { label: "Statut", width: 0.8 },
      ],
      rows: transfers.map((t: any) => [fmtDateTime(t.created_at), t.code, t.product_name, t.quantity, t.from_label, t.to_label, t.user_name, "Terminé"]),
    }),
  },
  {
    id: "movements",
    title: "Mouvements de stock",
    description: "Entrées, sorties, ajustements et transferts par dépôt.",
    icon: History,
    build: ({ movements }) => ({
      title: "Mouvements de stock",
      subtitle: `${movements.length} mouvement(s)`,
      fileBase: "Mouvements_stock",
      columns: [
        { label: "Date", width: 1.3 },
        { label: "Produit", width: 2 },
        { label: "Dépôt", width: 1.8 },
        { label: "Mouvement", width: 0.9, align: "right" },
        { label: "Motif", width: 2.2 },
        { label: "Utilisateur", width: 1.3 },
      ],
      rows: movements.map((m: any) => [fmtDateTime(m.at), m.product_name, m.warehouse_label || "Stock global", m.quantity, m.reason, m.user_name || ""]),
    }),
  },
];

function fmtSize(n: number) {
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`;
}

const FORMAT_STYLE: Record<string, string> = {
  pdf: "bg-red-50 text-red-700 border-red-200",
  xlsx: "bg-emerald-50 text-emerald-700 border-emerald-200",
  xls: "bg-emerald-50 text-emerald-700 border-emerald-200",
  csv: "bg-emerald-50 text-emerald-700 border-emerald-200",
  docx: "bg-blue-50 text-blue-700 border-blue-200",
  doc: "bg-blue-50 text-blue-700 border-blue-200",
};

export default function StockReportsPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const [docs, setDocs] = useState<any[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadDocs = async () => {
    try {
      const { data } = await api.get("/stock/report-documents");
      setDocs(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement des documents"));
    } finally {
      setLoadingDocs(false);
    }
  };
  useEffect(() => {
    loadDocs();
  }, []);

  const runExport = async (id: string, format: "pdf" | "csv") => {
    const report = REPORTS.find((r) => r.id === id)!;
    setBusy(`${id}-${format}`);
    try {
      const table = report.build(await fetchAll());
      const name = format === "pdf" ? exportPdf(table) : exportCsv(table);
      toast.success(`${name} exporté`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Export impossible"));
    } finally {
      setBusy(null);
    }
  };

  const pickFile = (f?: File | null) => {
    if (!f) return;
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    if (!ACCEPT.split(",").includes(`.${ext}`)) return toast.error("Format non accepté : PDF, Excel (.xlsx, .xls), Word (.docx, .doc) ou CSV");
    if (f.size > MAX_BYTES) return toast.error("Le fichier dépasse 5 Mo");
    setFile(f);
  };

  const upload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!file) return toast.error("Choisissez un fichier");
    const form = e.currentTarget;
    const f = form.elements as any;
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(new Error("Lecture du fichier impossible"));
        r.readAsDataURL(file);
      });
      await api.post("/stock/report-documents", {
        name: file.name,
        data_url: dataUrl,
        title: f.doc_title.value,
        category: f.doc_category.value,
        description: f.doc_description.value,
      });
      toast.success(`« ${file.name} » ajouté aux documents`);
      setFile(null);
      form.reset();
      loadDocs();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Envoi impossible"));
    } finally {
      setUploading(false);
    }
  };

  const download = async (d: any) => {
    try {
      const { data } = await api.get(`/stock/report-documents/${d.id}`);
      downloadDataUrl(data.data_url, data.name);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Téléchargement impossible"));
    }
  };

  const remove = async (d: any) => {
    try {
      await api.delete(`/stock/report-documents/${d.id}`);
      toast.success(`« ${d.title} » supprimé`);
      setConfirm(null);
      loadDocs();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Suppression impossible"));
    }
  };

  return (
    <div className="space-y-4">
      <GlassCard title="Exporter un rapport" icon={FileDown}>
        <p className="mb-3 text-xs text-slate-500">Les rapports reprennent les données du moment, au clic. PDF pour imprimer ou envoyer, Excel (CSV) pour retravailler les chiffres.</p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {REPORTS.map((r) => {
            const Icon = r.icon;
            return (
              <div key={r.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#0F3D68] to-[#1D6FB8] text-white shadow-[0_8px_20px_-8px_rgba(15,61,104,0.7)]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-900">{r.title}</h4>
                    <p className="text-[11px] text-slate-500">{r.description}</p>
                  </div>
                </div>
                <div className="mt-auto flex gap-2">
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runExport(r.id, "pdf")} className="h-8 flex-1 rounded-lg text-[11px] hover:border-red-200 hover:text-red-700">
                    {busy === `${r.id}-pdf` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileText className="mr-1 h-3.5 w-3.5" />} PDF
                  </Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runExport(r.id, "csv")} className="h-8 flex-1 rounded-lg text-[11px] hover:border-emerald-200 hover:text-emerald-700">
                    {busy === `${r.id}-csv` ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="mr-1 h-3.5 w-3.5" />} Excel (CSV)
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[380px_minmax(0,1fr)]">
        <GlassCard title="Ajouter un document" icon={FileUp}>
          <form onSubmit={upload} className="space-y-3 text-xs">
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                pickFile(e.dataTransfer.files?.[0]);
              }}
              className={`flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                dragOver ? "border-cyan-400 bg-cyan-50" : "border-slate-300 bg-slate-50 hover:border-[#0F3D68]"
              }`}
            >
              <Upload className="h-6 w-6 text-[#0F3D68]" />
              {file ? (
                <span className="font-semibold text-slate-900">
                  {file.name} · {fmtSize(file.size)}
                </span>
              ) : (
                <span className="font-semibold text-slate-700">Glissez un fichier ici ou cliquez pour choisir</span>
              )}
              <span className="text-[11px] text-slate-500">PDF, Excel (.xlsx, .xls), Word (.docx, .doc), CSV · 5 Mo max.</span>
            </button>
            <input ref={fileInput} id="doc_file" type="file" accept={ACCEPT} className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            <div>
              <Label htmlFor="doc_title" className="text-xs font-semibold">Titre</Label>
              <input id="doc_title" name="doc_title" placeholder="Inventaire septembre 2026" className={fieldCls} />
            </div>
            <div>
              <Label htmlFor="doc_category" className="text-xs font-semibold">Type de document</Label>
              <select id="doc_category" name="doc_category" className={fieldCls} defaultValue="Inventaire">
                {DOC_CATEGORIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="doc_description" className="text-xs font-semibold">Note (facultatif)</Label>
              <textarea id="doc_description" name="doc_description" rows={2} className={`${fieldCls} h-auto py-2`} />
            </div>
            <Button type="submit" disabled={uploading || !file} className="w-full bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
              {uploading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Upload className="mr-1.5 h-4 w-4" />} Enregistrer le document
            </Button>
          </form>
        </GlassCard>

        <GlassCard title={`Documents de rapports (${docs.length})`} icon={FolderOpen}>
          {loadingDocs ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-2.5 py-3 font-semibold">Document</th>
                    <th className="px-2.5 py-3 font-semibold">Type</th>
                    <th className="px-2.5 py-3 font-semibold">Ajouté par</th>
                    <th className="px-2.5 py-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {docs.map((d) => (
                    <tr key={d.id} className="hover:bg-cyan-50/40">
                      <td className="px-2.5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase ${FORMAT_STYLE[d.format] || "border-slate-200 bg-slate-50 text-slate-600"}`}>{d.format}</span>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{d.title}</div>
                            <div className="truncate text-[10px] text-slate-500">
                              {d.name} · {fmtSize(d.size)}
                              {d.description ? ` · ${d.description}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2.5 py-3 text-slate-600">{d.category}</td>
                      <td className="px-2.5 py-3 text-slate-600">
                        {d.uploaded_by}
                        <div className="text-[10px] text-slate-400">{fmtDateTime(d.created_at)}</div>
                      </td>
                      <td className="px-2.5 py-3 text-center">
                        {confirm === d.id ? (
                          <div role="alertdialog" aria-label={`Supprimer ${d.title}`} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-800">
                            Supprimer ?
                            <button type="button" onClick={() => remove(d)} className="rounded-md bg-red-600 px-2 py-0.5 font-bold text-white">Oui</button>
                            <button type="button" onClick={() => setConfirm(null)} className="rounded-md border border-red-200 bg-white px-2 py-0.5 font-semibold">Non</button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            <Button size="sm" variant="outline" onClick={() => download(d)} className="h-8 rounded-lg text-[11px] hover:border-cyan-300 hover:text-[#0F3D68]">
                              <Download className="mr-1 h-3.5 w-3.5" /> Télécharger
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setConfirm(d.id)} aria-label={`Supprimer ${d.title}`} className="h-8 w-8 rounded-lg p-0 text-red-600 hover:border-red-200 hover:bg-red-50">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!docs.length && (
                    <tr>
                      <td colSpan={4} className="p-8 text-center text-slate-500">
                        Aucun document. Ajoutez vos inventaires, modèles ou rapports avec le formulaire.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

