import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRightLeft, History, Loader2, Search } from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { fmtNum } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { GlassCard, StatusPill, fmtDateTime } from "@/components/stock/ui";
import { TransferDialog } from "@/components/stock/stockDialogs";

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-8 pr-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#0F3D68]/25"
      />
    </div>
  );
}

const MOVEMENT_REASONS: Record<string, string> = {
  reception: "Réception fournisseur",
  inventory_correction: "Correction d'inventaire",
  damage: "Perte / Avarie",
  gift: "Cadeau / Don",
  return: "Retour client",
};

/* ---------- Transferts ---------- */
export function TransfersPanel({ onStockChanged }: { onStockChanged?: () => void }) {
  const { has } = useAuth();
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/stock/transfers");
      setList(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur de chargement des transferts"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((t) => !s || [t.code, t.product_name, t.from_label, t.to_label, t.user_name].some((x) => x?.toLowerCase().includes(s)));
  }, [list, q]);

  return (
    <GlassCard
      title={`Transferts (${list.length})`}
      icon={ArrowRightLeft}
      right={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <SearchBox value={q} onChange={setQ} placeholder="Produit, dépôt, code…" />
          {has("stock.transfer") && (
            <Button size="sm" onClick={() => setOpen(true)} className="h-9 rounded-xl bg-[#0F3D68] text-white hover:bg-[#0B2F52]">
              <ArrowRightLeft className="mr-1 h-4 w-4" /> Transférer du stock
            </Button>
          )}
        </div>
      }
    >
      <p className="mb-3 text-xs text-slate-500">
        Un transfert retire la quantité du dépôt source et l'ajoute au dépôt destination, sur le même site ou entre deux sites. Le stock global ne change pas.
      </p>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2.5 py-3 font-semibold">Date</th>
                <th className="px-2.5 py-3 font-semibold">Référence</th>
                <th className="px-2.5 py-3 font-semibold">Produit</th>
                <th className="px-2.5 py-3 text-right font-semibold">Quantité</th>
                <th className="px-2.5 py-3 font-semibold">Source → Destination</th>
                <th className="px-2.5 py-3 font-semibold">Utilisateur</th>
                <th className="px-2.5 py-3 text-center font-semibold">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((t) => (
                <tr key={t.id} className="hover:bg-cyan-50/40">
                  <td className="whitespace-nowrap px-2.5 py-3 text-slate-600">{fmtDateTime(t.created_at)}</td>
                  <td className="px-2.5 py-3 font-mono font-semibold text-slate-700">{t.code}</td>
                  <td className="px-2.5 py-3 font-semibold text-slate-900">
                    {t.product_name}
                    {t.note && <div className="text-[10px] font-normal text-slate-500">{t.note}</div>}
                  </td>
                  <td className="px-2.5 py-3 text-right font-bold tabular-nums">{fmtNum(t.quantity)}</td>
                  <td className="px-2.5 py-3 text-slate-700">
                    {t.from_label} <span className="text-slate-400">→</span> {t.to_label}
                  </td>
                  <td className="px-2.5 py-3 text-slate-600">{t.user_name}</td>
                  <td className="px-2.5 py-3 text-center">
                    <StatusPill status={{ label: "Terminé", cls: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" }} />
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-500">
                    {list.length ? "Aucun transfert ne correspond à la recherche." : "Aucun transfert pour l'instant."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <TransferDialog
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            load();
            onStockChanged?.();
          }}
        />
      )}
    </GlassCard>
  );
}

/* ---------- Mouvements / historique ---------- */
export function MovementsPanel() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api
      .get("/stock/movements")
      .then(({ data }) => setList(Array.isArray(data) ? data : []))
      .catch((err) => toast.error(extractErrorMessage(err, "Erreur de chargement des mouvements")))
      .finally(() => setLoading(false));
  }, []);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter((m) => !s || [m.product_name, m.warehouse_label, m.reason, m.user_name].some((x) => x?.toLowerCase().includes(s)));
  }, [list, q]);

  return (
    <GlassCard title={`Mouvements / Historique (${list.length})`} icon={History} right={<SearchBox value={q} onChange={setQ} placeholder="Produit, dépôt, motif…" />}>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-2.5 py-3 font-semibold">Date</th>
                <th className="px-2.5 py-3 font-semibold">Produit</th>
                <th className="px-2.5 py-3 font-semibold">Dépôt</th>
                <th className="px-2.5 py-3 text-right font-semibold">Mouvement</th>
                <th className="px-2.5 py-3 font-semibold">Motif</th>
                <th className="px-2.5 py-3 font-semibold">Utilisateur</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((m) => (
                <tr key={m.id} className="hover:bg-cyan-50/40">
                  <td className="whitespace-nowrap px-2.5 py-3 text-slate-600">{fmtDateTime(m.at)}</td>
                  <td className="px-2.5 py-3 font-semibold text-slate-900">{m.product_name}</td>
                  <td className="px-2.5 py-3 text-slate-600">{m.warehouse_label || "Stock global"}</td>
                  <td className={`px-2.5 py-3 text-right font-bold tabular-nums ${m.quantity >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {m.quantity >= 0 ? "+" : ""}
                    {fmtNum(m.quantity)}
                  </td>
                  <td className="px-2.5 py-3 text-slate-600">{MOVEMENT_REASONS[m.reason] || m.reason}</td>
                  <td className="px-2.5 py-3 text-slate-600">{m.user_name || "-"}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500">
                    {list.length ? "Aucun mouvement ne correspond à la recherche." : "Aucun mouvement enregistré pour l'instant."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
