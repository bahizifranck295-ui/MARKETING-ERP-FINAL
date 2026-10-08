import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRightLeft,
  Boxes,
  ChevronRight,
  Database,
  Eye,
  History,
  Layers,
  Loader2,
  MapPin,
  PackagePlus,
  Sliders,
  Plus,
  TriangleAlert,
  User,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtMoney, fmtNum } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { ActivePill, GlassCard, KpiTile, ProductPhoto, StatusPill, fmtDateTime, stockStatus } from "@/components/stock/ui";
import { AddProductToDepotDialog, AdjustInDepotDialog, DepotFormDialog, SiteFormDialog, TransferDialog } from "@/components/stock/stockDialogs";

// Occupation du dépôt par rapport à sa capacité
function CapacityGauge({ depot }: { depot: any }) {
  if (!depot.capacity) return <span className="text-[11px] text-slate-400">Non définie</span>;
  const pct = Math.min(100, depot.occupancy || 0);
  const tone = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-gradient-to-r from-cyan-400 to-emerald-500";
  return (
    <div className="min-w-[120px]" title={`${fmtNum(depot.free_capacity)} unité(s) libre(s)`}>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span className="tabular-nums">
          {fmtNum(depot.quantity)} / {fmtNum(depot.capacity)}
        </span>
        <span className="font-semibold tabular-nums text-slate-700">{depot.occupancy} %</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

type View = { level: "sites" } | { level: "site"; siteId: string } | { level: "depot"; siteId: string; depotId: string };

function Breadcrumb({ items }: { items: Array<{ label: string; onClick?: () => void }> }) {
  return (
    <nav aria-label="Fil d'Ariane" className="flex flex-wrap items-center gap-1 text-xs">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          {it.onClick ? (
            <button type="button" onClick={it.onClick} className="font-semibold text-[#0F3D68] hover:underline">
              {it.label}
            </button>
          ) : (
            <span className="font-bold text-slate-900">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export default function SitesDepotsPanel({
  onStockChanged,
  initialSiteId,
  initialDepotId,
}: {
  onStockChanged?: () => void;
  initialSiteId?: string;
  initialDepotId?: string;
}) {
  const { has } = useAuth();
  const canManage = has("warehouse.manage");
  const canTransfer = has("stock.transfer");
  const canAddStock = has("stock.adjust") || has("stock.create");

  // Ouverture directe d'un site ou d'un dépôt (depuis le tableau de bord)
  const [view, setView] = useState<View>(
    initialSiteId && initialDepotId
      ? { level: "depot", siteId: initialSiteId, depotId: initialDepotId }
      : initialSiteId
      ? { level: "site", siteId: initialSiteId }
      : { level: "sites" }
  );
  const [sites, setSites] = useState<any[]>([]);
  const [depots, setDepots] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const canAdjust = has("stock.adjust");
  const [dialog, setDialog] = useState<null | "site" | "depot" | "add" | { transferFrom: string; productId?: string }>(null);
  const [adjusting, setAdjusting] = useState<any>(null);

  const site = view.level !== "sites" ? sites.find((s) => s.id === view.siteId) : null;

  const loadSites = async () => {
    const [s, d] = await Promise.all([api.get("/stock/sites"), api.get("/stock/depots")]);
    setSites(Array.isArray(s.data) ? s.data : []);
    setDepots(Array.isArray(d.data) ? d.data : []);
  };

  const loadDepot = async (id: string) => {
    const { data } = await api.get(`/stock/depots/${id}`);
    setDetail(data);
  };

  const refresh = async () => {
    try {
      await loadSites();
      if (view.level === "depot") await loadDepot(view.depotId);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement des sites"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (view.level === "depot") {
      setDetail(null);
      loadDepot(view.depotId).catch((err) => toast.error(extractErrorMessage(err, "Dépôt introuvable")));
    }
  }, [view]);

  const afterStockChange = async () => {
    setDialog(null);
    await refresh();
    onStockChanged?.();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  const toggleSite = async (s: any) => {
    try {
      await api.put(`/stock/sites/${s.id}`, { is_active: !s.is_active });
      toast.success(`Site ${s.name} ${s.is_active ? "désactivé" : "activé"}`);
      refresh();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Modification impossible"));
    }
  };

  return (
    <div className="space-y-4">
      {/* ----- Liste des sites ----- */}
      {view.level === "sites" && (
        <GlassCard
          title={`Sites (${sites.length})`}
          icon={MapPin}
          right={
            canManage && (
              <Button size="sm" onClick={() => setDialog("site")} className="h-8 rounded-xl bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
                <Plus className="mr-1 h-4 w-4" /> Nouveau site
              </Button>
            )
          }
        >
          <p className="mb-3 text-xs text-slate-500">Chaque site regroupe ses dépôts. Cliquez sur un site pour voir ses dépôts.</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sites.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setView({ level: "site", siteId: s.id })}
                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:border-cyan-300 hover:shadow-[0_14px_34px_-16px_rgba(15,61,104,0.45)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-[#0F3D68]" />
                      <span className="truncate text-base font-black text-slate-900">{s.name}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-slate-500">{s.code}</div>
                    {s.location && <div className="mt-0.5 truncate text-[11px] text-slate-500">{s.location}</div>}
                  </div>
                  <ActivePill active={s.is_active !== false} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  {[
                    { k: "Dépôts", v: fmtNum(s.depot_count) },
                    { k: "Produits", v: fmtNum(s.product_count) },
                    { k: "Valeur", v: fmtMoney(s.value) },
                  ].map((x) => (
                    <div key={x.k} className="rounded-xl bg-slate-50 px-1 py-2">
                      <dt className="text-[10px] text-slate-500">{x.k}</dt>
                      <dd className="truncate text-xs font-bold tabular-nums text-slate-900">{x.v}</dd>
                    </div>
                  ))}
                </dl>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F3D68] group-hover:underline">
                  Voir les dépôts <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>
            ))}
            {!sites.length && <p className="text-xs text-slate-500">Aucun site. Créez le premier avec « Nouveau site ».</p>}
          </div>
        </GlassCard>
      )}

      {/* ----- Un site et ses dépôts ----- */}
      {view.level === "site" && site && (
        <>
          <Breadcrumb items={[{ label: "Sites", onClick: () => setView({ level: "sites" }) }, { label: site.name }]} />
          <GlassCard
            title={`Site : ${site.name}`}
            icon={MapPin}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <ActivePill active={site.is_active !== false} />
                {canManage && (
                  <Button size="sm" variant="outline" onClick={() => toggleSite(site)} className="h-8 rounded-xl text-[11px]">
                    {site.is_active !== false ? "Désactiver" : "Activer"}
                  </Button>
                )}
                {canManage && (
                  <Button size="sm" onClick={() => setDialog("depot")} className="h-8 rounded-xl bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
                    <Plus className="mr-1 h-4 w-4" /> Nouveau dépôt
                  </Button>
                )}
              </div>
            }
          >
            <p className="mb-3 text-xs text-slate-500">
              <span className="font-mono">{site.code}</span>
              {site.location ? ` · ${site.location}` : ""} · {fmtNum(site.depot_count)} dépôt(s)
              {site.description ? ` · ${site.description}` : ""}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-2.5 py-3 font-semibold">Dépôt</th>
                    <th className="px-2.5 py-3 text-right font-semibold">Produits</th>
                    <th className="px-2.5 py-3 text-right font-semibold">Quantité</th>
                    <th className="px-2.5 py-3 font-semibold">Capacité</th>
                    <th className="px-2.5 py-3 text-right font-semibold">Valeur du stock</th>
                    <th className="px-2.5 py-3 text-center font-semibold">Statut</th>
                    <th className="px-2.5 py-3 text-center font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {depots
                    .filter((d) => d.site_id === site.id)
                    .map((d) => (
                      <tr key={d.id} className="hover:bg-cyan-50/40">
                        <td className="px-2.5 py-3">
                          <div className="font-semibold text-slate-900">{d.name}</div>
                          <div className="flex flex-wrap gap-x-2 text-[10px] text-slate-500">
                            <span className="font-mono">{d.code}</span>
                            {d.manager && (
                              <span className="inline-flex items-center gap-0.5">
                                <User className="h-3 w-3" /> {d.manager}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2.5 py-3 text-right font-semibold tabular-nums">{fmtNum(d.product_count)}</td>
                        <td className="px-2.5 py-3 text-right tabular-nums">{fmtNum(d.quantity)}</td>
                        <td className="px-2.5 py-3">
                          <CapacityGauge depot={d} />
                        </td>
                        <td className="px-2.5 py-3 text-right font-semibold tabular-nums">{fmtMoney(d.value)}</td>
                        <td className="px-2.5 py-3 text-center">
                          <ActivePill active={d.is_active !== false} />
                        </td>
                        <td className="px-2.5 py-3 text-center">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setView({ level: "depot", siteId: site.id, depotId: d.id })}
                            className="h-8 rounded-lg text-[11px] hover:border-cyan-300 hover:text-[#0F3D68]"
                          >
                            <Eye className="mr-1 h-3.5 w-3.5" /> Voir
                          </Button>
                        </td>
                      </tr>
                    ))}
                  {!depots.some((d) => d.site_id === site.id) && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-500">
                        Ce site n'a pas encore de dépôt. Ajoutez-en un avec « Nouveau dépôt ».
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}

      {/* ----- Vue détaillée d'un dépôt ----- */}
      {view.level === "depot" && site && (
        <>
          <Breadcrumb
            items={[
              { label: "Sites", onClick: () => setView({ level: "sites" }) },
              { label: site.name, onClick: () => setView({ level: "site", siteId: site.id }) },
              { label: detail?.depot?.name || "…" },
            ]}
          />
          {!detail ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-black text-slate-900">
                    {site.name} → {detail.depot.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    <span className="font-mono">{detail.depot.code}</span>
                    {detail.depot.manager ? ` · Responsable : ${detail.depot.manager}` : ""}
                    {detail.depot.address ? ` · ${detail.depot.address}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActivePill active={detail.depot.is_active !== false} />
                  {canAddStock && detail.depot.is_active !== false && (
                    <Button size="sm" onClick={() => setDialog("add")} className="h-8 rounded-xl bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
                      <PackagePlus className="mr-1 h-4 w-4" /> Ajouter un produit
                    </Button>
                  )}
                  {canTransfer && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDialog({ transferFrom: detail.depot.id })}
                      className="h-8 rounded-xl hover:border-cyan-300 hover:text-[#0F3D68]"
                    >
                      <ArrowRightLeft className="mr-1 h-4 w-4" /> Transférer du stock
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiTile icon={Boxes} glow="from-blue-500 to-indigo-600" label="Produits" value={fmtNum(detail.depot.product_count)} hint="Présents dans ce dépôt" />
                <KpiTile
                  icon={Layers}
                  glow="from-cyan-500 to-sky-600"
                  label="Quantité totale"
                  value={fmtNum(detail.depot.quantity)}
                  hint={
                    detail.depot.capacity
                      ? `Capacité ${fmtNum(detail.depot.capacity)} · ${detail.depot.occupancy} % occupé · ${fmtNum(detail.depot.free_capacity)} libres`
                      : "Capacité non définie"
                  }
                />
                <KpiTile icon={Database} glow="from-[#0F3D68] to-[#1D6FB8]" label="Valeur du stock" value={fmtMoney(detail.depot.value)} hint="Au prix d'achat" />
                <KpiTile icon={TriangleAlert} glow="from-amber-400 to-orange-500" label="Stock faible" value={fmtNum(detail.depot.low_count)} hint="Sous le seuil d'alerte" />
              </div>

              <GlassCard title="Produits du dépôt" icon={Boxes}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="px-2.5 py-3 font-semibold">Produit</th>
                        <th className="px-2.5 py-3 font-semibold">Catégorie</th>
                        <th className="px-2.5 py-3 text-right font-semibold">Quantité</th>
                        <th className="px-2.5 py-3 text-right font-semibold">Prix achat</th>
                        <th className="px-2.5 py-3 text-right font-semibold">Valeur stock</th>
                        <th className="px-2.5 py-3 text-center font-semibold">Statut</th>
                        {(canTransfer || canAdjust) && <th className="px-2.5 py-3 text-center font-semibold">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detail.items.map((p: any) => {
                        const threshold = Number(p.low_stock_threshold ?? p.alert_threshold) || 0;
                        return (
                          <tr key={p.id} className="hover:bg-cyan-50/40">
                            <td className="px-2.5 py-3">
                              <div className="flex items-center gap-2.5">
                                <ProductPhoto src={p.image_url} />
                                <div className="min-w-0">
                                  <div className="truncate font-semibold text-slate-900">
                                    {p.name}
                                    {p.size && <span className="ml-1 font-normal text-slate-500">· {p.size}</span>}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    <span className="font-mono">{p.code}</span>
                                    {p.location_ref ? ` · Emplacement ${p.location_ref}` : ""}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-2.5 py-3 text-slate-600">{p.category || "Général"}</td>
                            <td className="px-2.5 py-3 text-right font-bold tabular-nums text-slate-900">
                              {fmtNum(p.quantity)} <span className="text-[10px] font-normal text-slate-400">{p.unit}</span>
                            </td>
                            <td className="px-2.5 py-3 text-right tabular-nums">{fmtMoney(p.cost_price || 0)}</td>
                            <td className="px-2.5 py-3 text-right font-semibold tabular-nums">{fmtMoney(p.value)}</td>
                            <td className="px-2.5 py-3 text-center">
                              <StatusPill status={stockStatus(p.quantity, threshold)} />
                            </td>
                            {(canTransfer || canAdjust) && (
                              <td className="px-2.5 py-3 text-center">
                                <div className="flex items-center justify-center gap-1.5">
                                  {canAdjust && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => setAdjusting(p)}
                                      className="h-8 rounded-lg text-[11px] hover:border-cyan-300 hover:text-[#0F3D68]"
                                    >
                                      <Sliders className="mr-1 h-3.5 w-3.5" /> Ajuster
                                    </Button>
                                  )}
                                  {canTransfer && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={p.quantity <= 0}
                                      onClick={() => setDialog({ transferFrom: detail.depot.id, productId: p.id })}
                                      className="h-8 rounded-lg text-[11px] hover:border-cyan-300 hover:text-[#0F3D68]"
                                    >
                                      <ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Transférer
                                    </Button>
                                  )}
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                      {!detail.items.length && (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-500">
                            Aucun produit dans ce dépôt. Utilisez « Ajouter un produit » ou transférez du stock depuis un autre dépôt.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </GlassCard>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <GlassCard title="Derniers mouvements" icon={History}>
                  <ul className="divide-y divide-slate-100 text-xs">
                    {detail.movements.map((m: any) => (
                      <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-slate-800">{m.product_name}</div>
                          <div className="truncate text-[10px] text-slate-500">
                            {fmtDateTime(m.at)} · {m.reason}
                          </div>
                        </div>
                        <span className={`shrink-0 font-bold tabular-nums ${m.quantity >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {m.quantity >= 0 ? "+" : ""}
                          {fmtNum(m.quantity)}
                        </span>
                      </li>
                    ))}
                    {!detail.movements.length && <li className="py-4 text-center text-slate-500">Aucun mouvement pour ce dépôt.</li>}
                  </ul>
                </GlassCard>
                <GlassCard title="Transferts récents" icon={ArrowRightLeft}>
                  <ul className="divide-y divide-slate-100 text-xs">
                    {detail.transfers.map((t: any) => (
                      <li key={t.id} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-semibold text-slate-800">
                            {t.product_name} · {fmtNum(t.quantity)}
                          </span>
                          <span className="shrink-0 font-mono text-[10px] text-slate-500">{t.code}</span>
                        </div>
                        <div className="truncate text-[10px] text-slate-500">
                          {t.from_label} → {t.to_label} · {fmtDateTime(t.created_at)}
                        </div>
                      </li>
                    ))}
                    {!detail.transfers.length && <li className="py-4 text-center text-slate-500">Aucun transfert pour ce dépôt.</li>}
                  </ul>
                </GlassCard>
              </div>
            </>
          )}
        </>
      )}

      {dialog === "site" && (
        <SiteFormDialog
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {dialog === "depot" && site && (
        <DepotFormDialog
          site={site}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            refresh();
          }}
        />
      )}
      {adjusting && detail && (
        <AdjustInDepotDialog
          depot={detail.depot}
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onSaved={() => {
            setAdjusting(null);
            afterStockChange();
          }}
        />
      )}
      {dialog === "add" && detail && <AddProductToDepotDialog depot={detail.depot} onClose={() => setDialog(null)} onSaved={afterStockChange} />}
      {dialog && typeof dialog === "object" && (
        <TransferDialog presetFromId={dialog.transferFrom} presetProductId={dialog.productId} onClose={() => setDialog(null)} onSaved={afterStockChange} />
      )}
    </div>
  );
}

