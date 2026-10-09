import React, { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Search,
  CheckCircle2,
  DollarSign,
  Loader2,
  FileText,
  Users,
  Coins,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, StatCard, fmtMoney } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import CompteClientView from "@/components/CompteClientView";

export default function CreditsPage() {
  const { has } = useAuth();
  const [activeTab, setActiveTab] = useState<"clients" | "marketers">("clients");
  const [debts, setDebts] = useState<any[]>([]);
  const [marketers, setMarketers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedMarketer, setSelectedMarketer] = useState<string>("all");
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [viewingClientId, setViewingClientId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // En cours (reste à payer) / soldées / toutes
  const [statusView, setStatusView] = useState<"open" | "paid" | "all">("open");

  // Billetage state for collection modal
  const [billetUSD, setBilletUSD] = useState<Record<string, number>>({
    "100": 0,
    "50": 0,
    "20": 0,
    "10": 0,
    "5": 0,
    "1": 0,
  });
  const [billetCDF, setBilletCDF] = useState<Record<string, number>>({
    "20000": 0,
    "10000": 0,
    "5000": 0,
    "1000": 0,
    "500": 0,
  });
  const [exchangeRate, setExchangeRate] = useState<number>(2500);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [debtsRes, markRes] = await Promise.all([
        api.get("/credits/debts"),
        api.get("/credits/marketers"),
      ]);
      setDebts(Array.isArray(debtsRes.data) ? debtsRes.data : []);
      setMarketers(Array.isArray(markRes.data) ? markRes.data : []);
    } catch (err) {
      if (!silent) toast.error(extractErrorMessage(err, "Erreur chargement créances"));
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // Temps réel : nouvelles ventes à crédit et encaissements visibles sans recharger la page
    const t = window.setInterval(() => {
      if (document.visibilityState !== "hidden") loadData(true);
    }, 15000);
    return () => window.clearInterval(t);
  }, []);

  const remainingOf = (d: any) => Number(d.remaining ?? d.balance ?? 0) || 0;

  const totalDebt = useMemo(() => {
    return debts.reduce((sum, d) => sum + remainingOf(d), 0);
  }, [debts]);

  const totalMarketersDebt = useMemo(() => {
    return marketers.reduce((sum, m) => sum + (m.total_remaining || 0), 0);
  }, [marketers]);

  const filteredDebts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return debts.filter((d) => {
      const matchQ =
        !q ||
        d.client_name?.toLowerCase().includes(q) ||
        d.client_code?.toLowerCase().includes(q) ||
        d.marketer_name?.toLowerCase().includes(q) ||
        d.client_phone?.toLowerCase().includes(q);
      const matchM =
        selectedMarketer === "all" ||
        d.marketer_name === selectedMarketer ||
        d.marketer_id === selectedMarketer;
      const open = remainingOf(d) > 0;
      const matchS = statusView === "all" || (statusView === "open" ? open : !open && d.status !== "cancelled");
      return matchQ && matchM && matchS;
    });
  }, [debts, search, selectedMarketer, statusView]);

  const totalBilletUSD = useMemo(() => {
    return Object.entries(billetUSD).reduce((acc, [denom, qty]) => {
      return acc + Number(denom) * (Number(qty) || 0);
    }, 0);
  }, [billetUSD]);

  const totalBilletCDF = useMemo(() => {
    return Object.entries(billetCDF).reduce((acc, [denom, qty]) => {
      return acc + Number(denom) * (Number(qty) || 0);
    }, 0);
  }, [billetCDF]);

  const cdfEquivalentUSD = useMemo(() => {
    return exchangeRate > 0 ? Math.round((totalBilletCDF / exchangeRate) * 100) / 100 : 0;
  }, [totalBilletCDF, exchangeRate]);

  const grandTotalUSD = useMemo(() => {
    return Math.round((totalBilletUSD + cdfEquivalentUSD) * 100) / 100;
  }, [totalBilletUSD, cdfEquivalentUSD]);

  const openPaymentModal = (debt: any) => {
    setSelectedDebt(debt);
    setBilletUSD({ "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0 });
    setBilletCDF({ "20000": 0, "10000": 0, "5000": 0, "1000": 0, "500": 0 });
  };

  const handlePayDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDebt) return;
    setSaving(true);
    const form = e.target as any;
    const directAmount = Number(form.elements.amount?.value) || 0;
    const finalAmount = grandTotalUSD > 0 ? grandTotalUSD : directAmount;
    const method = form.elements.method?.value || "cash";

    if (finalAmount <= 0) {
      toast.error("Veuillez saisir un montant ou renseigner le billetage");
      setSaving(false);
      return;
    }
    const due = remainingOf(selectedDebt);
    if (finalAmount > due + 0.005) {
      toast.error(`Le montant dépasse le reste dû (${fmtMoney(due)})`);
      setSaving(false);
      return;
    }

    try {
      await api.post(`/clients/${selectedDebt.client_id}/payments`, {
        amount: finalAmount,
        credit_id: selectedDebt.id,
        reference: `ENC-${(selectedDebt.order_code || "CRD").replace(/[^A-Z0-9-]/gi, "")}-${Date.now().toString().slice(-4)}`,
        billetage: grandTotalUSD > 0 ? { usd: billetUSD, cdf: billetCDF, total_usd: totalBilletUSD, total_cdf: totalBilletCDF, exchange_rate: exchangeRate } : undefined,
        payment_method: method,
        notes: `Règlement créance client (${selectedDebt.client_name}) - Marketeur: ${
          selectedDebt.marketer_name || "N/A"
        }`,
      });
      toast.success(
        `Règlement de ${fmtMoney(finalAmount)} enregistré avec succès ! Caisse et créances mises à jour.`
      );
      setSelectedDebt(null);
      loadData();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec du règlement"));
    } finally {
      setSaving(false);
    }
  };

  if (viewingClientId) {
    return (
      <CompteClientView
        clientId={viewingClientId}
        onBack={() => setViewingClientId(null)}
        onEditClient={() => {}}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gestion des Crédits & Créances"
        subtitle="Suivi des impayés clients, dettes à charge des marketeurs et encaissements"
        right={
          <div className="flex gap-2 bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab("clients")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "clients"
                  ? "bg-white text-[#0F3D68] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Créances Clients
            </button>
            <button
              onClick={() => setActiveTab("marketers")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === "marketers"
                  ? "bg-white text-[#0F3D68] shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Dettes des Marketeurs
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          label="Total Créances Clients"
          value={fmtMoney(totalDebt)}
          sub="Montant total dû par les clients"
          tone="red"
        />
        <StatCard
          label="Dettes sous Marketeurs"
          value={fmtMoney(totalMarketersDebt)}
          sub={`${marketers.length} marketeurs responsables`}
          tone="amber"
        />
        <StatCard
          label="Clients Débiteurs"
          value={String(new Set(debts.filter((d) => remainingOf(d) > 0).map((d) => d.client_id)).size)}
          sub="Comptes avec solde débiteur"
          tone="blue"
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Rechercher par client, code, téléphone ou marketeur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-white border-slate-200 text-xs"
          />
        </div>
        <select
          value={selectedMarketer}
          onChange={(e) => setSelectedMarketer(e.target.value)}
          className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700"
        >
          <option value="all">Tous les marketeurs</option>
          {marketers.map((m) => (
            <option key={m.marketer_id} value={m.marketer_name}>
              {m.marketer_name} ({fmtMoney(m.total_remaining)})
            </option>
          ))}
        </select>
        {activeTab === "clients" && (
          <select
            value={statusView}
            onChange={(e) => setStatusView(e.target.value as any)}
            aria-label="Statut des créances"
            className="h-10 px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-700"
          >
            <option value="open">Créances en cours</option>
            <option value="paid">Créances soldées</option>
            <option value="all">Toutes</option>
          </select>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : activeTab === "clients" ? (
        filteredDebts.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Aucune créance en cours !"
            subtitle="Tous vos clients sont à jour de paiement pour ce filtre."
          />
        ) : (
          <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                    <th className="p-3.5">Date / Référence</th>
                    <th className="p-3.5">Client</th>
                    <th className="p-3.5">Marketeur Responsable</th>
                    <th className="p-3.5 text-right">Dette Restante</th>
                    <th className="p-3.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredDebts.map((d) => (
                    <tr key={d.id || d.client_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <span className="font-mono font-bold text-slate-800 block">
                          {d.order_code || d.client_code}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {d.created_at ? new Date(d.created_at).toLocaleDateString("fr-FR") : "-"}
                        </span>
                      </td>
                      <td className="p-3.5">
                        <div className="font-bold text-slate-900 text-sm">{d.client_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {d.client_phone || "Sans téléphone"}
                        </div>
                      </td>
                      <td className="p-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          {d.marketer_name || "Direction Commerciale"}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="font-black text-sm text-blue-700">
                          {fmtMoney(remainingOf(d))}
                        </div>
                        <span className={`text-[10px] uppercase font-bold ${remainingOf(d) > 0 ? "text-blue-500" : "text-emerald-600"}`}>
                          {d.status === "cancelled" ? "Annulée" : remainingOf(d) > 0 ? (d.paid > 0 ? `Payé ${fmtMoney(d.paid)} · reste` : "À payer") : "Soldée"}
                        </span>
                        {d.initial_amount ? <div className="text-[10px] text-slate-400">sur {fmtMoney(d.initial_amount)}</div> : null}
                      </td>
                      <td className="p-3.5 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {remainingOf(d) > 0 && (
                            <Button
                              size="sm"
                              onClick={() => openPaymentModal(d)}
                              className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-3 font-semibold shadow-xs"
                            >
                              <DollarSign className="h-3.5 w-3.5 mr-1" /> Encaisser
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewingClientId(d.client_id)}
                            className="h-8 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 text-xs px-2.5 font-medium"
                          >
                            <FileText className="h-3.5 w-3.5 mr-1" /> Relevé
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 flex items-start gap-3">
            <Users className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm">Gestion des dettes à charge des marketeurs</p>
              <p className="text-blue-700 mt-0.5">
                Le système reprend automatiquement les clients associés à chaque marketeur et les crédits contractés.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4">
            {marketers
              .filter(
                (m) =>
                  selectedMarketer === "all" ||
                  m.marketer_name === selectedMarketer ||
                  m.marketer_id === selectedMarketer
              )
              .map((m) => (
                <div
                  key={m.marketer_id || m.marketer_name}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
                >
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl bg-purple-100 text-purple-700 font-bold flex items-center justify-center text-sm">
                        {m.marketer_name.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{m.marketer_name}</h3>
                        <span className="text-xs text-slate-500 font-medium">
                          {m.clients_count} client(s) débiteur(s) à sa charge
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Total Dette à Charge
                        </span>
                        <span className="text-base font-black text-blue-700">
                          {fmtMoney(m.total_remaining)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {m.clients.map((c: any) => (
                      <div
                        key={c.credit_id || c.client_id}
                        className="p-3.5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{c.client_name}</span>
                            <span className="font-mono text-[10px] text-slate-400">
                              ({c.client_code})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Date de dette :{" "}
                            {c.created_at ? new Date(c.created_at).toLocaleDateString("fr-FR") : "-"} •{" "}
                            Montant initial : {fmtMoney(c.initial_amount)}
                          </div>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <div className="text-right">
                            <div className="font-black text-sm text-blue-700">
                              {fmtMoney(c.remaining)}
                            </div>
                            <span className="text-[10px] font-bold text-blue-600 uppercase">
                              Solde restant
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              size="sm"
                              onClick={() =>
                                openPaymentModal({
                                  ...c,
                                  marketer_name: m.marketer_name,
                                  balance: c.remaining,
                                })
                              }
                              className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 font-semibold"
                            >
                              <DollarSign className="h-3.5 w-3.5 mr-1" /> Encaisser
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setViewingClientId(c.client_id)}
                              className="h-8 rounded-xl border-slate-200 text-slate-600 hover:bg-slate-50 text-xs px-2.5 font-medium"
                            >
                              <FileText className="h-3.5 w-3.5 mr-1" /> Compte
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* MULTIDEVISE BILLETAGE CASH COLLECTION MODAL */}
      {selectedDebt && (
        <Dialog open onOpenChange={() => setSelectedDebt(null)}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Coins className="h-5 w-5 text-emerald-600" />
                Encaisser Créance : {selectedDebt.client_name}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handlePayDebt} className="space-y-4 pt-2 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex justify-between items-center">
                <div>
                  <span className="text-slate-500 block text-[11px]">Dette Totale à régler :</span>
                  <span className="text-lg font-black text-blue-700">
                    {fmtMoney(remainingOf(selectedDebt))}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block text-[10px]">Marketeur responsable :</span>
                  <span className="font-semibold text-slate-800">
                    {selectedDebt.marketer_name || "N/A"}
                  </span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 text-xs">
                    Billetage multidevise (Coupures physiques)
                  </span>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <span>Taux 1$ =</span>
                    <input
                      type="number"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(Number(e.target.value) || 2500)}
                      className="w-16 h-6 px-1.5 rounded border border-slate-200 font-bold text-slate-900"
                    />
                    <span>FC</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="border border-slate-200 rounded-xl p-3 bg-emerald-50/30 space-y-2">
                    <div className="flex justify-between items-center font-bold text-emerald-800">
                      <span>Billets USD ($)</span>
                      <span>{fmtMoney(totalBilletUSD)}</span>
                    </div>
                    <div className="space-y-1.5">
                      {["100", "50", "20", "10", "5", "1"].map((denom) => (
                        <div key={denom} className="flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-700 font-semibold w-16">
                            {denom} $ :
                          </span>
                          <Input
                            type="number"
                            min="0"
                            value={billetUSD[denom] || ""}
                            onChange={(e) =>
                              setBilletUSD({
                                ...billetUSD,
                                [denom]: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="0"
                            className="h-7 w-20 text-right font-bold text-xs"
                          />
                          <span className="font-mono text-slate-500 w-16 text-right">
                            = {(Number(denom) * (billetUSD[denom] || 0)).toFixed(0)} $
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-3 bg-blue-50/30 space-y-2">
                    <div className="flex justify-between items-center font-bold text-blue-800">
                      <span>Billets CDF (FC)</span>
                      <span>{totalBilletCDF.toLocaleString()} FC</span>
                    </div>
                    <div className="space-y-1.5">
                      {["20000", "10000", "5000", "1000", "500"].map((denom) => (
                        <div key={denom} className="flex items-center justify-between gap-2">
                          <span className="font-mono text-slate-700 font-semibold w-20">
                            {Number(denom).toLocaleString()} FC :
                          </span>
                          <Input
                            type="number"
                            min="0"
                            value={billetCDF[denom] || ""}
                            onChange={(e) =>
                              setBilletCDF({
                                ...billetCDF,
                                [denom]: Number(e.target.value) || 0,
                              })
                            }
                            placeholder="0"
                            className="h-7 w-20 text-right font-bold text-xs"
                          />
                          <span className="font-mono text-slate-500 w-16 text-right">
                            = {(Number(denom) * (billetCDF[denom] || 0)).toLocaleString()}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="pt-1 border-t border-blue-200 text-right text-[11px] text-blue-700 font-semibold">
                      Équivalent USD : + {fmtMoney(cdfEquivalentUSD)}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-emerald-100/60 border border-emerald-200 rounded-xl flex items-center justify-between">
                  <span className="font-bold text-emerald-900">Total Encaissé (USD) :</span>
                  <span className="text-xl font-black text-emerald-800">
                    {fmtMoney(grandTotalUSD > 0 ? grandTotalUSD : (selectedDebt.balance || 0))}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <Label className="text-xs font-semibold">Montant direct (si sans billetage)</Label>
                  <Input
                    name="amount"
                    type="number"
                    step="0.01"
                    defaultValue={selectedDebt.balance || selectedDebt.remaining}
                    className="mt-1 h-9 rounded-lg font-bold"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Mode de versement</Label>
                  <select
                    name="method"
                    className="w-full mt-1 h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium"
                  >
                    <option value="cash">Espèces (Caisse)</option>
                    <option value="mobile_money">Mobile Money (Airtel/M-Pesa)</option>
                    <option value="bank">Virement Bancaire</option>
                  </select>
                </div>
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setSelectedDebt(null)}>
                  Annuler
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                  Valider l'Encaissement
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
