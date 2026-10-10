import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Download, Eye, FileText, History, Loader2, Printer } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { closeTab, isClaudePreview, openPendingTab, presentDocument, saveFile } from "@/lib/documentViewer";
import {
  CREDIT_COLUMNS,
  STOCK_COLUMNS,
  buildStockStateReportPdf,
  fmtAmount,
  fmtDay,
  fmtQty,
  mainTitle,
  neutralNote,
  sectionTitleOf,
  reportTitle,
  stockStateFileName,
} from "@/lib/exportStockStateReportPdf";

/*
 * Rapports › État de stock : rapport automatique « Sales & Stock Report »
 * (modèle papier PREMIDIS) filtré par site, catégorie, date / période et dépôt.
 * Les données viennent du serveur (/reports/stock-state) ; chaque rapport généré
 * est conservé dans l'historique tel qu'il a été calculé.
 */

const ADMIN_ROLES = ["super_admin", "chef_dept", "dg"];
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const startIso = (day: string) => new Date(`${day}T00:00:00`).toISOString();
const endIso = (day: string) => new Date(`${day}T23:59:59.999`).toISOString();
const dayLabel = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR");

const fieldCls =
  "h-9 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/30";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-slate-600">
      {label}
      {children}
    </label>
  );
}

function StockTableView({ rows, totals }: { rows: any[]; totals: any }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[11px]">
        <thead>
          <tr className="bg-[#211A5C] text-white">
            {STOCK_COLUMNS.map((c, i) => (
              <th key={c.key} className={`border border-[#211A5C] px-2 py-1.5 font-bold ${i ? "text-center" : "text-left"}`}>
                {c.label}
                <div className="text-[9px] font-normal opacity-80">{c.sub}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.product_id} className="odd:bg-white even:bg-slate-50/60">
              <td className="border border-slate-300 px-2 py-1.5 font-semibold text-slate-900">
                <span data-no-translate>{r.product}</span>
                {r.unit && <span className="ml-1 font-normal text-slate-500">({r.unit})</span>}
              </td>
              {(["opening", "received", "sent", "cash", "credit", "damage", "closing"] as const).map((k) => (
                <td key={k} className={`border border-slate-300 px-2 py-1.5 text-right tabular-nums ${k === "closing" ? "font-bold" : ""}`}>
                  {k === "opening" || k === "closing" ? Math.round(r[k] || 0).toLocaleString("fr-FR") : fmtQty(r[k])}
                </td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={8} className="border border-slate-300 px-2 py-3 text-center italic text-slate-500">
                Aucun produit de cette catégorie dans ce périmètre.
              </td>
            </tr>
          )}
          {rows.length > 0 && (
            <tr className="bg-slate-100 font-bold">
              <td className="border border-slate-300 px-2 py-1.5">TOTAL</td>
              {(["opening", "received", "sent", "cash", "credit", "damage", "closing"] as const).map((k) => (
                <td key={k} className="border border-slate-300 px-2 py-1.5 text-right tabular-nums">
                  {Math.round(totals[k] || 0).toLocaleString("fr-FR")}
                </td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Prévisualisation à l'écran du document complet (même contenu que le PDF). */
function ReportDocument({ report, periodLabel, preparedBy }: { report: any; periodLabel: string; preparedBy: string }) {
  return (
    <div className="mx-auto max-w-[900px] rounded-xl border border-slate-300 bg-white p-4 shadow-sm sm:p-6">
      <div className="border-2 border-[#211A5C]">
        <div className="flex items-center gap-3 px-3 py-2">
          <img src="/assets/premidis-logo.svg" alt="" className="h-10 w-12 object-contain" />
          <div className="flex-1 text-center">
            <div className="text-base font-black text-[#211A5C] sm:text-lg">
              PREMIDIS SARL · <span data-no-translate>{report.category}</span> Sales &amp; Stock Report
            </div>
            <div className="text-[11px] text-slate-500">Rapport des ventes et de l'état de stock</div>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t border-slate-300 sm:grid-cols-4">
          {[
            ["Branch / Site", report.site_name],
            ["Date", periodLabel],
            ["Catégorie", report.category],
            ["Dépôt", report.warehouse_name],
          ].map(([k, v], i) => (
            <div key={k} className={`px-3 py-1.5 ${i ? "sm:border-l" : ""} border-slate-300`}>
              <div className="text-[10px] font-bold text-slate-500">{k}</div>
              <div className="text-xs font-bold text-slate-900" data-no-translate={i === 1 ? undefined : ""}>
                {v}
              </div>
            </div>
          ))}
        </div>
      </div>

      <h4 className="mb-1.5 mt-4 text-xs font-bold text-[#211A5C]">{mainTitle(report)}</h4>
      <StockTableView rows={report.main.rows} totals={report.main.totals} />
      {report.main.intra_site_neutral && (
        <p className="mt-1 text-[10px] italic text-slate-500">{neutralNote(report)}</p>
      )}

      {report.warehouse_id === "all" &&
        report.sections.map((s: any) => (
          <div key={s.warehouse_id}>
            <h4 className="mb-1.5 mt-4 text-xs font-bold text-[#211A5C]">{sectionTitleOf(s)}</h4>
            <StockTableView rows={s.rows} totals={s.totals} />
          </div>
        ))}

      <h4 className="mb-1.5 mt-5 text-xs font-bold text-[#211A5C]">Notes / Justification des dommages et cadeaux</h4>
      {report.notes.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[11px]">
            <thead>
              <tr className="bg-[#211A5C] text-left text-white">
                {["Date", "Produit", "Qté", "Dépôt", "Motif", "Commentaire"].map((h) => (
                  <th key={h} className={`px-2 py-1.5 ${h === "Qté" ? "text-right" : ""}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.notes.map((n: any, i: number) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="px-2 py-1.5">{fmtDay(n.date)}</td>
                  <td className="px-2 py-1.5 font-semibold" data-no-translate>{n.product}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(n.quantity)}</td>
                  <td className="px-2 py-1.5" data-no-translate>{n.depot}</td>
                  <td className="px-2 py-1.5">{n.motif}</td>
                  <td className="px-2 py-1.5 text-slate-600" data-no-translate>{n.comment || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs italic text-slate-500">Aucune opération enregistrée.</p>
      )}

      <h4 className="mb-1.5 mt-5 text-xs font-bold text-[#211A5C]">Credit Sales — Ventes à crédit</h4>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-[11px]">
          <thead>
            <tr className="bg-[#211A5C] text-left text-white">
              {CREDIT_COLUMNS.map((h, i) => (
                <th key={h} className={`px-2 py-1.5 ${i >= 3 && i <= 5 ? "text-right" : ""}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.credit.map((c: any, i: number) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="px-2 py-1.5">{i + 1}</td>
                <td className="px-2 py-1.5 font-semibold" data-no-translate>{c.client}</td>
                <td className="px-2 py-1.5" data-no-translate>{c.product}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtQty(c.qty)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtAmount(c.price, c.currency)}</td>
                <td className="px-2 py-1.5 text-right font-bold tabular-nums">{fmtAmount(c.amount, c.currency)}</td>
                <td className="px-2 py-1.5 text-slate-600">{c.comment}</td>
              </tr>
            ))}
            {!report.credit.length && (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center italic text-slate-500">
                  Aucune vente à crédit sur la période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2 text-xs">
        <span>
          <strong>Prepared by :</strong> <span data-no-translate>{preparedBy}</span>
        </span>
        <span className="text-slate-500">Généré le {new Date(report.computed_at).toLocaleString("fr-FR")}</span>
      </div>
    </div>
  );
}

export default function StockStateReport({
  siteKey,
  historyFilter,
}: {
  siteKey?: string;
  historyFilter?: { site: string; depot: string; category: string } | null;
}) {
  const { user } = useAuth() as any;
  const restrictedSite = user && !ADMIN_ROLES.includes(user.role_code) && !user.is_transversal && user.site_id ? user.site_id : null;

  const [sites, setSites] = useState<any[]>([]);
  const [depots, setDepots] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [siteId, setSiteId] = useState("");
  const [category, setCategory] = useState("");
  const [depotId, setDepotId] = useState("all");
  const [mode, setMode] = useState<"day" | "period">("day");
  const [day, setDay] = useState(todayStr());
  const [fromDay, setFromDay] = useState(todayStr().slice(0, 8) + "01");
  const [toDay, setToDay] = useState(todayStr());
  const [generating, setGenerating] = useState(false);
  const [current, setCurrent] = useState<any>(null); // entrée d'historique affichée
  const [history, setHistory] = useState<any[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const loadHistory = () =>
    api
      .get("/reports/stock-state/history")
      .then(({ data }) => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]));

  useEffect(() => {
    Promise.all([api.get("/stock/sites"), api.get("/stock/depots"), api.get("/stock/categories")])
      .then(([s, d, c]) => {
        const allSites = Array.isArray(s.data) ? s.data : [];
        setSites(restrictedSite ? allSites.filter((x: any) => x.id === restrictedSite) : allSites);
        setDepots(Array.isArray(d.data) ? d.data : []);
        const cats = (Array.isArray(c.data) ? c.data : []).map((x: any) => (typeof x === "string" ? x : x.name)).filter(Boolean);
        setCategories(cats);
        setCategory((cur) => cur || cats[0] || "");
      })
      .catch((err) => toast.error(extractErrorMessage(err, "Chargement des filtres impossible")));
    loadHistory();
  }, []);

  // Site : celui choisi en haut des Rapports, sinon le site d'affectation, sinon le premier site
  useEffect(() => {
    if (!sites.length) return;
    // En-tête des Rapports sur « Tous les sites » : vue d'ensemble (si l'utilisateur voit tous les sites)
    const overview = !restrictedSite && sites.length > 1 ? "all" : null;
    const pick =
      (siteKey && siteKey !== "all" && sites.find((x) => x.id === siteKey)?.id) ||
      (siteKey === "all" && overview) ||
      (user?.site_id && sites.find((x) => x.id === user.site_id)?.id) ||
      overview ||
      sites[0].id;
    setSiteId(pick);
    setDepotId("all");
  }, [sites, siteKey]);

  // Historique du plus récent (en haut) au plus ancien (en bas), 10 rapports par page
  const HISTORY_PAGE = 10;
  const shownHistory = useMemo(() => {
    const f = historyFilter;
    const list = !f
      ? history
      : history.filter(
          (h) =>
            (f.site === "all" || h.site_id === f.site) &&
            (f.depot === "all" || h.warehouse_id === f.depot) &&
            (f.category === "all" || String(h.category).toLowerCase() === f.category.toLowerCase())
        );
    return [...list].sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime());
  }, [history, historyFilter]);
  const [historyPage, setHistoryPage] = useState(1);
  const historyPages = Math.max(1, Math.ceil(shownHistory.length / HISTORY_PAGE));
  const curHistoryPage = Math.min(historyPage, historyPages);
  const pageHistory = shownHistory.slice((curHistoryPage - 1) * HISTORY_PAGE, curHistoryPage * HISTORY_PAGE);
  // Nouveau tri ou nouveau rapport : retour à la première page (rapports les plus récents)
  useEffect(() => setHistoryPage(1), [historyFilter, history.length]);

  const siteDepots = useMemo(() => depots.filter((w) => w.site_id === siteId), [depots, siteId]);
  const periodLabel = mode === "day" ? dayLabel(day) : `Du ${dayLabel(fromDay)} au ${dayLabel(toDay)}`;
  const periodKey = mode === "day" ? day : `${fromDay}_au_${toDay}`;

  const generate = async () => {
    if (!siteId || !category) return toast.error("Choisissez un site et une catégorie");
    const from = mode === "day" ? startIso(day) : startIso(fromDay);
    const to = mode === "day" ? endIso(day) : endIso(toDay);
    if (new Date(from) > new Date(to)) return toast.error("La date de début doit précéder la date de fin");
    setGenerating(true);
    try {
      const { data } = await api.post("/reports/stock-state/history", {
        site_id: siteId,
        category,
        warehouse_id: depotId,
        from,
        to,
        period_label: periodLabel,
        period_key: periodKey,
      });
      setCurrent({ ...data, period_key: periodKey });
      loadHistory();
      toast.success("Rapport généré");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Génération du rapport impossible"));
    } finally {
      setGenerating(false);
    }
  };

  const openFromHistory = async (h: any) => {
    setBusy(h.id);
    try {
      const { data } = await api.get(`/reports/stock-state/history/${h.id}`);
      setCurrent(data);
      return data;
    } catch (err) {
      toast.error(extractErrorMessage(err, "Rapport introuvable"));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const pdfOf = (entry: any) =>
    buildStockStateReportPdf(entry.data, { periodLabel: entry.period_label, preparedBy: entry.generated_by, generatedAt: entry.generated_at });
  const fileOf = (entry: any) => stockStateFileName(entry.data, entry.period_key || entry.period_label);

  // L'onglet du visualiseur est ouvert pendant le clic (sinon Chrome le bloque)
  const preview = async (source: any | (() => Promise<any>)) => {
    const tab = openPendingTab("État de stock");
    try {
      const entry = typeof source === "function" ? await source() : source;
      if (!entry) return closeTab(tab);
      const ok = await presentDocument(await pdfOf(entry), fileOf(entry), tab);
      if (!ok) closeTab(tab);
    } catch (err) {
      closeTab(tab);
      toast.error(extractErrorMessage(err, "Prévisualisation impossible"));
    }
  };

  const download = async (entry: any) => {
    try {
      await saveFile(await pdfOf(entry), fileOf(entry));
    } catch (err) {
      toast.error(extractErrorMessage(err, "Téléchargement impossible"));
    }
  };

  const print = async (entry: any) => {
    try {
      const blob = await pdfOf(entry);
      if (isClaudePreview()) {
        toast.info("L'aperçu Claude ne permet pas l'impression directe : enregistrez le PDF puis imprimez-le depuis le visualiseur.");
        return void saveFile(blob, fileOf(entry));
      }
      const url = URL.createObjectURL(blob);
      const frame = document.createElement("iframe");
      frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
      frame.src = url;
      frame.onload = () => {
        try {
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        } catch {
          window.open(url, "_blank");
        }
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 120_000);
      };
      document.body.appendChild(frame);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Impression impossible"));
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <FileText className="h-4 w-4 text-[#0F3D68]" /> Rapport d'état de stock (Sales &amp; Stock Report)
        </h3>
        <span className="text-[11px] text-slate-500">Calculé automatiquement à partir des enregistrements de l'ERP</span>
      </div>

      {/* Filtres */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Site">
          <select value={siteId} onChange={(e) => { setSiteId(e.target.value); setDepotId("all"); }} className={fieldCls} disabled={!!restrictedSite}>
            {!restrictedSite && sites.length > 1 && <option value="all">Tous les sites (vue d'ensemble)</option>}
            {sites.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Catégorie">
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldCls}>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Date / Période">
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className={fieldCls}>
            <option value="day">Date précise</option>
            <option value="period">Période</option>
          </select>
        </Field>
        {mode === "day" ? (
          <Field label="Date">
            <input type="date" value={day} max={todayStr()} onChange={(e) => setDay(e.target.value)} className={fieldCls} />
          </Field>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Du">
              <input type="date" value={fromDay} max={toDay} onChange={(e) => setFromDay(e.target.value)} className={fieldCls} />
            </Field>
            <Field label="Au">
              <input type="date" value={toDay} min={fromDay} onChange={(e) => setToDay(e.target.value)} className={fieldCls} />
            </Field>
          </div>
        )}
        <Field label="Dépôt">
          <select value={depotId} onChange={(e) => setDepotId(e.target.value)} className={fieldCls} disabled={siteId === "all"}>
            <option value="all">Tous les dépôts</option>
            {siteDepots.map((w) => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={generate} disabled={generating || !siteId || !category} className="rounded-xl bg-[#0F3D68] text-xs text-white hover:bg-[#0B2F52]">
          {generating ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-1.5 h-4 w-4" />}
          Générer le rapport
        </Button>
        {current && (
          <>
            <Button variant="outline" onClick={() => preview(current)} className="rounded-xl text-xs">
              <Eye className="mr-1.5 h-4 w-4" /> Prévisualiser
            </Button>
            <Button variant="outline" onClick={() => download(current)} className="rounded-xl text-xs">
              <Download className="mr-1.5 h-4 w-4" /> Télécharger PDF
            </Button>
            <Button variant="outline" onClick={() => print(current)} className="rounded-xl text-xs">
              <Printer className="mr-1.5 h-4 w-4" /> Imprimer
            </Button>
          </>
        )}
      </div>

      {/* Zone de prévisualisation du rapport */}
      {current ? (
        <div className="space-y-2 rounded-2xl bg-slate-100 p-2 sm:p-4">
          <p className="text-center text-[11px] text-slate-600">
            {`Instantané conservé tel que généré le ${new Date(current.generated_at).toLocaleString("fr-FR")} par ${current.generated_by}`}
          </p>
          <ReportDocument report={current.data} periodLabel={current.period_label} preparedBy={current.generated_by} />
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500">
          Choisissez le site, la catégorie, la date ou la période et le dépôt, puis « Générer le rapport ».
        </div>
      )}

      {/* Barre de tri Site / Dépôt / Catégorie (placée ici par l'état des stocks) : trie aussi l'historique */}
      <div id="stock-sort-bar-slot" />

      {/* Historique des rapports (trié par la barre Site / Dépôt / Catégorie de l'état des stocks) */}
      <div>
        <h4 className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-900">
          <History className="h-4 w-4 text-[#0F3D68]" /> Historique des rapports ({shownHistory.length})
          {shownHistory.length !== history.length && (
            <span className="text-[11px] font-normal text-slate-500">
              · filtré par la barre de tri (site, dépôt, catégorie) : {shownHistory.length} sur {history.length}
            </span>
          )}
        </h4>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[760px] text-left text-[11px]">
            <thead>
              <tr className="bg-slate-50 font-semibold text-slate-600">
                <th className="p-2.5">Site</th>
                <th className="p-2.5">Catégorie</th>
                <th className="p-2.5">Dépôt</th>
                <th className="p-2.5">Période</th>
                <th className="p-2.5">Généré le</th>
                <th className="p-2.5">Utilisateur</th>
                <th className="p-2.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pageHistory.map((h) => (
                <tr key={h.id} className={current?.id === h.id ? "bg-blue-50/60" : ""}>
                  <td className="p-2.5 font-semibold" data-no-translate>{h.site_name}</td>
                  <td className="p-2.5" data-no-translate>{h.category}</td>
                  <td className="p-2.5" data-no-translate={h.warehouse_id === "all" ? undefined : ""}>{h.warehouse_name}</td>
                  <td className="p-2.5">{h.period_label}</td>
                  <td className="p-2.5">{new Date(h.generated_at).toLocaleString("fr-FR")}</td>
                  <td className="p-2.5" data-no-translate>{h.generated_by}</td>
                  <td className="p-2.5">
                    <div className="flex flex-wrap justify-center gap-1">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px]" disabled={busy === h.id} onClick={() => openFromHistory(h)}>
                        Ouvrir
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {!shownHistory.length && (
                <tr>
                  <td colSpan={7} className="p-4 text-center text-slate-500">
                    {history.length ? "Aucun rapport pour ce tri." : "Aucun rapport généré pour le moment."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {shownHistory.length > HISTORY_PAGE && (
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
            <span>
              Rapports {(curHistoryPage - 1) * HISTORY_PAGE + 1}–{Math.min(curHistoryPage * HISTORY_PAGE, shownHistory.length)} sur {shownHistory.length}
            </span>
            <div className="flex flex-wrap items-center gap-1" role="navigation" aria-label="Pages de l'historique">
              <button
                type="button"
                disabled={curHistoryPage === 1}
                onClick={() => setHistoryPage(curHistoryPage - 1)}
                className="h-7 rounded-lg border border-slate-200 px-2 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ‹
              </button>
              {Array.from({ length: historyPages }, (_, i) => i + 1).map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-current={n === curHistoryPage ? "page" : undefined}
                  onClick={() => setHistoryPage(n)}
                  className={`h-7 min-w-7 rounded-lg px-2 font-bold ${n === curHistoryPage ? "bg-[#0F3D68] text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                >
                  {n}
                </button>
              ))}
              <button
                type="button"
                disabled={curHistoryPage === historyPages}
                onClick={() => setHistoryPage(curHistoryPage + 1)}
                className="h-7 rounded-lg border border-slate-200 px-2 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
