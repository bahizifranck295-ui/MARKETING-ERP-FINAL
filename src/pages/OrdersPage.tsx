import React, { useEffect, useState, useMemo } from "react";
import { MULTI_SITE } from "@/app/edition";
import { toast } from "sonner";
import {
  ShoppingCart,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Coins,
  FileText,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, StatusBadge, fmtMoney, fmtDate } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import InvoiceModal, { InvoiceData } from "@/components/InvoiceModal";

export default function OrdersPage() {
  const { user, has } = useAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<InvoiceData | null>(null);
  const [returnToDetailsOrder, setReturnToDetailsOrder] = useState<any>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingOrder, setRejectingOrder] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  const handleViewInvoice = (ord: any) => {
    if (selectedOrder) {
      setReturnToDetailsOrder(selectedOrder);
      setSelectedOrder(null);
    }
    setInvoiceOrder({
      ...ord,
      credit_check: ord.credit_check,
      has_credit_alert: Boolean(
        ord.credit_check?.is_exceeded && ord.payment_method === "credit"
      ),
    });
  };

  // Approuver et rejeter sont deux permissions distinctes (vérifiées aussi par le serveur)
  const canApproveOnly = has("orders.approve");
  const canReject = has("orders.reject");
  const canApprove = canApproveOnly || canReject;

  // Tri par site ; un utilisateur rattaché à un site ne voit que son site
  const ALL = "all";
  const siteLocked = !!(user as any)?.site_id && !["super_admin", "dg"].includes(user?.role_code || "") && !(user as any)?.is_transversal;
  const [sites, setSites] = useState<any[]>([]);
  const [siteFilter, setSiteFilter] = useState<string>(siteLocked ? (user as any).site_id : ALL);
  useEffect(() => {
    api.get("/integration/sites").then(({ data }) => setSites(Array.isArray(data) ? data : [])).catch(() => setSites([]));
  }, []);
  useEffect(() => {
    if (siteLocked) setSiteFilter((user as any).site_id);
  }, [siteLocked, (user as any)?.site_id]);
  const visibleSites = siteLocked ? sites.filter((x) => x.id === (user as any).site_id) : sites;

  const loadOrders = async () => {
    setLoading(true);
    try {
      const res = await api.get("/orders");
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement commandes"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const openOrderDetails = async (ord: any) => {
    setSelectedOrder(ord);
    try {
      const res = await api.get(`/orders/${ord.id}/credit-check`);
      if (res.data) {
        setSelectedOrder((prev: any) =>
          prev?.id === ord.id ? { ...prev, credit_check: res.data } : prev
        );
      }
    } catch {
      // conserver le snapshot présent
    }
  };

  const pendingCount = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status === "pending_approval" &&
        (siteFilter === ALL || o.site_id === siteFilter)
    ).length;
  }, [orders, siteFilter]);

  const filteredOrders = useMemo(() => {
    return orders.filter((ord) => {
      if (siteFilter !== ALL && ord.site_id !== siteFilter) return false;
      // « Validées » : commandes approuvées, quelle que soit leur étape logistique (projet Stock & Livraison)
      const matchStatus =
        statusFilter === "all" ||
        ord.status === statusFilter ||
        (statusFilter === "validated" && ["prepared", "shipped", "delivered"].includes(ord.status));
      const q = search.trim().toLowerCase();
      const matchQ =
        !q ||
        ord.code.toLowerCase().includes(q) ||
        (ord.client_name && ord.client_name.toLowerCase().includes(q)) ||
        (ord.marketer_name && ord.marketer_name.toLowerCase().includes(q));
      return matchStatus && matchQ;
    });
  }, [orders, statusFilter, search, siteFilter]);

  const handleApprove = async (id: string, overrideCreditLimit = false) => {
    setBusyId(id);
    try {
      await api.post(`/orders/${id}/approve`, {
        override_credit_limit: overrideCreditLimit,
      });
      toast.success(
        overrideCreditLimit
          ? "Commande approuvée sous dérogation exceptionnelle de Direction !"
          : "Commande approuvée avec succès !"
      );
      loadOrders();
      if (selectedOrder?.id === id) setSelectedOrder(null);
    } catch (err: any) {
      const errorMsg =
        err?.response?.data?.detail ||
        extractErrorMessage(err, "Échec de l'approbation");
      toast.error(errorMsg, { duration: 6000 });
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrder) return;
    setBusyId(rejectingOrder.id);
    try {
      await api.post(`/orders/${rejectingOrder.id}/reject`, {
        reason: rejectionReason.trim() || "Non spécifié",
      });
      toast.success("Commande rejetée");
      setRejectingOrder(null);
      setRejectionReason("");
      loadOrders();
      if (selectedOrder?.id === rejectingOrder.id) setSelectedOrder(null);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec du rejet"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gestion des Commandes"
        subtitle="Validation, suivi des ventes terrain et historique des commandes"
        right={
          MULTI_SITE && has("orders.filter") && (
          <div className="flex flex-wrap items-center gap-2" data-orders-scope>
            <select
              aria-label="Site"
              value={siteFilter}
              disabled={siteLocked}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 disabled:bg-slate-50 disabled:text-slate-500"
            >
              {!siteLocked && <option value={ALL}>Tous les sites</option>}
              {visibleSites.map((x) => (
                <option key={x.id} value={x.id} data-no-translate>
                  {x.name}
                </option>
              ))}
            </select>
          </div>
          )
        }
      />

      {/* Alert banner for pending approvals */}
      {pendingCount > 0 && canApprove && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
            <span className="font-semibold text-amber-950">
              {pendingCount} commande{pendingCount > 1 ? "s sont" : " est"} en attente d'approbation directe dans ce module
            </span>
          </div>
          {statusFilter !== "pending_approval" && (
            <Button
              size="sm"
              onClick={() => setStatusFilter("pending_approval")}
              className="h-8 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold self-start sm:self-auto"
            >
              Afficher les {pendingCount} commande{pendingCount > 1 ? "s" : ""}
            </Button>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      {has("orders.filter") && (
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Rechercher par référence, client, vendeur..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-10 rounded-xl bg-white border-slate-200 text-xs"
          />
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          {["all", "pending_approval", "validated", "cancelled"].map(
            (st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-2 rounded-xl font-medium border whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                  statusFilter === st
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                }`}
              >
                <span>
                  {st === "all"
                    ? "Toutes"
                    : st === "pending_approval"
                    ? "À approuver"
                    : st === "validated"
                    ? "Validées"
                    : "Annulées"}
                </span>
                {st === "pending_approval" && pendingCount > 0 && (
                  <span
                    className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                      statusFilter === st ? "bg-white text-brand" : "bg-amber-500 text-white"
                    }`}
                  >
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          )}
        </div>
      </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : filteredOrders.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Aucune commande trouvée"
          subtitle="Modifiez vos critères de recherche."
        />
      ) : (
        <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden divide-y divide-slate-100 shadow-xs">
          {filteredOrders.map((ord) => {
            const isCreditOrder = ord.payment_method === "credit";
            const isExceeded = Boolean(ord.credit_check?.is_exceeded && isCreditOrder);
            return (
              <div
                key={ord.id}
                className={`p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isExceeded ? "bg-red-50/25 border-l-4 border-l-red-500" : ""
                }`}
              >
                <div
                  className="cursor-pointer space-y-1.5 flex-1"
                  onClick={() => openOrderDetails(ord)}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-800">{ord.code}</span>
                    <StatusBadge status={ord.status} />
                    <span className="text-[11px] text-slate-400">• {fmtDate(ord.created_at)}</span>
                    {ord.status === "pending_approval" && (
                      <>
                        {isCreditOrder ? (
                          isExceeded ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-100 border border-red-300 px-2 py-0.5 rounded-lg">
                              <AlertTriangle className="h-3 w-3 text-red-600" />
                              Dépassement crédit (+{fmtMoney(ord.credit_check?.exceeded_amount || 0, "USD")})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              Crédit conforme
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                            <Coins className="h-3 w-3 text-blue-600" />
                            Comptant (Approbation directe)
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{ord.client_name}</span>
                    {isCreditOrder && ord.credit_check && (
                      <span className="text-[11px] text-slate-500 font-medium">
                        (Limite : {fmtMoney(ord.credit_check.credit_limit, "USD")} • Solde : {fmtMoney(ord.credit_check.current_balance, "USD")})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    Par : {ord.marketer_name || "Vendeur"} • {ord.items?.length || 0} article(s)
                  </div>
                  {ord.status === "cancelled" && ord.rejection_reason && (
                    <div className="text-[11px] text-red-600 bg-red-50 px-2 py-0.5 rounded-lg inline-block">
                      Motif : {ord.rejection_reason}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  <div className="text-right">
                    <div className="text-base font-black text-slate-900">
                      {ord.currency === "CDF"
                        ? `${(ord.total_fc || Math.round(ord.total * 2500)).toLocaleString("fr-FR")} FC`
                        : fmtMoney(ord.total, "USD")}
                    </div>
                    <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
                      {isCreditOrder ? "Crédit" : ord.payment_method === "cash" ? "Espèces / Cash" : "Banque"}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {ord.status === "pending_approval" && canApprove && (
                      <>
                        {!canApproveOnly ? null : isExceeded ? (
                          <Button
                            size="sm"
                            onClick={() => {
                              toast.error("Contrôle CRM : Dépassement de la limite de crédit ! Consultez la fiche détaillée.");
                              openOrderDetails(ord);
                            }}
                            className="h-8 rounded-xl bg-red-100 text-red-700 hover:bg-red-200 border border-red-300 text-xs px-2.5 font-bold"
                            title="Examen CRM obligatoire avant toute décision"
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mr-1 text-red-600" /> Crédit Dépassé
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => handleApprove(ord.id)}
                            disabled={busyId === ord.id}
                            className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-2.5 font-semibold"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approuver
                          </Button>
                        )}
                        {canReject && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setRejectingOrder(ord);
                            setRejectionReason(
                              isExceeded
                                ? `Rejet pour dépassement du plafond de crédit client autorisé (+${fmtMoney(ord.credit_check?.exceeded_amount || 0, "USD")})`
                                : ""
                            );
                          }}
                          disabled={busyId === ord.id}
                          className="h-8 rounded-xl border-red-200 text-red-600 hover:bg-red-50 text-xs px-2.5 font-semibold"
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Rejeter
                        </Button>
                        )}
                      </>
                    )}
                    {has("orders.print") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleViewInvoice(ord)}
                      className="h-8 rounded-xl border-slate-200 text-slate-700 hover:text-brand hover:bg-slate-50 text-xs px-2.5 font-semibold"
                      title="Voir la facture officielle"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1 text-brand" /> Voir la facture
                    </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ORDER DETAILS DIALOG */}
      {selectedOrder && (() => {
        const creditCheck = selectedOrder.credit_check;
        const isCredit = selectedOrder.payment_method === "credit";
        const isCashOrBank = !isCredit;
        const isExceeded = Boolean(creditCheck?.is_exceeded && isCredit);
        const exceededAmount = creditCheck?.exceeded_amount || 0;
        const creditLimit = creditCheck?.credit_limit || 0;
        const currentBalance = creditCheck?.current_balance || 0;
        const availableCredit =
          creditCheck?.available_credit ?? Math.max(0, creditLimit - Math.max(0, currentBalance));
        const projectedBalance =
          creditCheck?.projected_balance ?? (isCredit ? currentBalance + (selectedOrder.total || 0) : currentBalance);
        const creditRemainingAfter =
          creditCheck?.credit_remaining_after ?? Math.max(0, creditLimit - projectedBalance);

        return (
          <Dialog open onOpenChange={() => setSelectedOrder(null)}>
            <DialogContent className="w-[95vw] max-w-2xl max-h-[92vh] p-3 sm:p-3.5 bg-white rounded-xl border border-slate-200 shadow-2xl flex flex-col gap-1.5 overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-100 pb-1 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-sm sm:text-base font-bold text-slate-900">
                    Commande {selectedOrder.code}
                  </span>
                  <StatusBadge status={selectedOrder.status} />
                  {isExceeded && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-300">
                      <AlertTriangle className="h-2.5 w-2.5 text-red-600" />
                      Alerte Dépassement Crédit
                    </span>
                  )}
                </div>
                <div className="text-right text-[10px] text-slate-400">
                  {fmtDate(selectedOrder.created_at)}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200 text-[10.5px] shrink-0">
                <div className="min-w-0">
                  <span className="text-[8.5px] text-slate-400 block font-semibold uppercase">Client</span>
                  <span className="font-bold text-slate-900 truncate block text-[10.5px]">{selectedOrder.client_name}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-[8.5px] text-slate-400 block font-semibold uppercase">Commercial</span>
                  <span className="font-medium text-slate-800 truncate block text-[10.5px]">{selectedOrder.marketer_name || "Direction Commerciale"}</span>
                </div>
                <div className="min-w-0">
                  <span className="text-[8.5px] text-slate-400 block font-semibold uppercase">Paiement</span>
                  <span className={`font-bold uppercase block text-[10.5px] ${isCredit ? "text-amber-700" : "text-emerald-700"}`}>
                    {selectedOrder.payment_method || "Espèces"}
                  </span>
                </div>
                <div className="min-w-0">
                  <span className="text-[8.5px] text-slate-400 block font-semibold uppercase">Statut Règlement</span>
                  <span className="font-medium capitalize text-slate-700 block text-[10.5px]">
                    {selectedOrder.payment_status === "paid" ? "Payé" : "En attente"}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 overflow-hidden shadow-2xs shrink-0">
                <div className="bg-brand text-white px-2.5 py-1 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="h-3 w-3 text-amber-300" />
                    <span className="font-bold text-[10.5px] uppercase tracking-wide">
                      Situation Crédit Client • Contrôle CRM
                    </span>
                  </div>
                  <span
                    className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                      isCredit
                        ? isExceeded
                          ? "bg-red-500 text-white animate-pulse"
                          : "bg-emerald-500 text-white"
                        : "bg-blue-500 text-white"
                    }`}
                  >
                    {isCredit
                      ? isExceeded
                        ? "Dépassement de crédit"
                        : "Crédit autorisé"
                      : `Comptant (${selectedOrder.payment_method || "Cash"})`}
                  </span>
                </div>
                <div className="p-1.5 sm:p-2 bg-slate-50/70 space-y-1">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <div className="bg-white p-1.5 px-2 rounded-md border border-slate-200 shadow-2xs">
                      <div className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider">
                        1. Limite crédit
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold text-slate-900 mt-0.5 font-mono">
                        {fmtMoney(creditLimit, "USD")}
                      </div>
                      <div className="text-[8px] text-slate-400">Plafond accordé</div>
                    </div>
                    <div className="bg-white p-1.5 px-2 rounded-md border border-slate-200 shadow-2xs">
                      <div className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider">
                        2. Solde actuel
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold text-amber-800 mt-0.5 font-mono">
                        {fmtMoney(currentBalance, "USD")}
                      </div>
                      <div className="text-[8px] text-slate-500">
                        Dispo : <strong className="text-emerald-700">{fmtMoney(availableCredit, "USD")}</strong>
                      </div>
                    </div>
                    <div className="bg-white p-1.5 px-2 rounded-md border border-slate-200 shadow-2xs">
                      <div className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider">
                        3. Montant commande
                      </div>
                      <div className="text-xs sm:text-sm font-extrabold text-blue-900 mt-0.5 font-mono">
                        {fmtMoney(selectedOrder.total, "USD")}
                      </div>
                      <div className="text-[8px] text-slate-500 capitalize">
                        {isCredit ? "Crédit" : selectedOrder.payment_method || "Cash"}
                      </div>
                    </div>
                    <div
                      className={`p-1.5 px-2 rounded-md border shadow-2xs ${
                        isExceeded
                          ? "bg-red-50 border-red-300 text-red-950"
                          : "bg-white border-slate-200 text-slate-900"
                      }`}
                    >
                      <div className="text-[8.5px] text-slate-400 font-bold uppercase tracking-wider">
                        4. Solde projeté
                      </div>
                      <div
                        className={`text-xs sm:text-sm font-extrabold mt-0.5 font-mono ${
                          isExceeded ? "text-red-700" : "text-emerald-700"
                        }`}
                      >
                        {fmtMoney(projectedBalance, "USD")}
                      </div>
                      <div
                        className={`text-[8px] font-bold ${
                          isExceeded ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {isExceeded
                          ? `Dépassement : +${fmtMoney(exceededAmount, "USD")}`
                          : `Reste : ${fmtMoney(creditRemainingAfter, "USD")}`}
                      </div>
                    </div>
                  </div>

                  {isCredit && isExceeded && (
                    <div className="bg-red-50/90 border border-red-300 rounded-md p-1 px-2 flex items-center justify-between gap-1.5 text-red-950 text-[10px]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <AlertTriangle className="h-3 w-3 text-red-600 shrink-0" />
                        <span className="truncate">
                          <strong>Alerte Plafond Dépassé (+{fmtMoney(exceededAmount, "USD")}) :</strong> Solde projeté <strong>{fmtMoney(projectedBalance, "USD")}</strong> &gt; Limite {fmtMoney(creditLimit, "USD")}.
                        </span>
                      </div>
                      <span className="text-[8.5px] font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded shrink-0">
                        Approbation bloquée
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden shadow-2xs shrink-0 flex flex-col">
                <div className="bg-slate-100/80 px-2.5 py-0.5 border-b border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-700">
                  <span>Articles commandés ({selectedOrder.items?.length || 0})</span>
                  <span>Prix unitaire / Total</span>
                </div>
                <div className="divide-y divide-slate-100 text-[10px]">
                  {(selectedOrder.items || []).slice(0, 3).map((it: any, idx: number) => (
                    <div key={idx} className="p-1 px-2.5 flex items-center justify-between bg-white hover:bg-slate-50/50">
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="font-semibold text-slate-900 truncate text-[10.5px]">{it.product_name}</div>
                        <div className="text-[9px] text-slate-400">Qté : {it.quantity} {it.unit || "unité(s)"}</div>
                      </div>
                      <div className="text-right shrink-0 font-mono">
                        <div className="font-bold text-slate-900 text-[10.5px]">
                          {it.unit_price_fc
                            ? `${(it.quantity * it.unit_price_fc).toLocaleString("fr-FR")} FC`
                            : fmtMoney(it.quantity * it.unit_price, "USD")}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="bg-slate-50 border-t border-slate-200 px-2.5 py-1 flex items-center justify-between">
                  <span className="font-bold text-[10px] text-slate-700 uppercase">Total Commande :</span>
                  <div className="text-right">
                    <span className="text-xs sm:text-sm font-black text-brand font-mono">
                      {fmtMoney(selectedOrder.total, selectedOrder.currency || "USD")}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between sm:justify-end gap-1.5 shrink-0 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setSelectedOrder(null)} className="h-7.5 px-2.5 text-xs">
                  Fermer
                </Button>
                {has("orders.print") && (
                <Button
                  size="sm"
                  onClick={() => handleViewInvoice(selectedOrder)}
                  className="h-7.5 px-2.5 bg-brand hover:bg-brand-strong text-white text-xs font-semibold"
                >
                  <FileText className="h-3.5 w-3.5 mr-1" /> Voir la facture
                </Button>
                )}
                {selectedOrder.status === "pending_approval" && canApprove && (
                  <>
                    {canReject && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRejectingOrder(selectedOrder);
                        setRejectionReason(
                          isExceeded
                            ? `Rejet pour dépassement du plafond de crédit autorisé : Solde projeté ${fmtMoney(projectedBalance, "USD")} > Limite ${fmtMoney(creditLimit, "USD")}`
                            : ""
                        );
                      }}
                      className="h-7.5 px-2 border-red-200 text-red-600 hover:bg-red-50 text-xs"
                    >
                      <XCircle className="h-3.5 w-3.5 mr-1" /> Rejeter
                    </Button>
                    )}
                    {!canApproveOnly ? null : isExceeded ? (
                      <div className="flex items-center gap-1">
                        <Button
                          disabled
                          size="sm"
                          className="h-7.5 px-2 bg-slate-100 text-slate-500 font-semibold cursor-not-allowed border border-slate-200 text-xs"
                        >
                          <AlertCircle className="h-3 w-3 mr-1 text-red-500" />
                          Bloquée (Plafond dépassé)
                        </Button>
                        {has("orders.override_credit") && (
                          <Button
                            size="sm"
                            onClick={() => handleApprove(selectedOrder.id, true)}
                            disabled={busyId === selectedOrder.id}
                            variant="outline"
                            className="h-7.5 px-2 border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 font-semibold text-xs"
                          >
                            {busyId === selectedOrder.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                            ) : null}
                            Dérogation Direction
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleApprove(selectedOrder.id, false)}
                        disabled={busyId === selectedOrder.id}
                        className="h-7.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs"
                      >
                        {busyId === selectedOrder.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                        )}
                        Approuver
                      </Button>
                    )}
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* REJECT REASON DIALOG */}
      {rejectingOrder && (
        <Dialog open onOpenChange={() => setRejectingOrder(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-base text-red-700">
                Motif du rejet de la commande {rejectingOrder.code}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-xs text-slate-500">
                Veuillez indiquer la raison pour laquelle cette commande est refusée.
              </p>
              <Textarea
                placeholder="Exemple : Dépassement de plafond de crédit autorisé..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
                className="text-xs"
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setRejectingOrder(null)}>
                Annuler
              </Button>
              <Button
                onClick={handleConfirmReject}
                disabled={busyId === rejectingOrder.id}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {busyId === rejectingOrder.id ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Confirmer le Rejet
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* FACTURE UNIFIÉE */}
      <InvoiceModal
        isOpen={Boolean(invoiceOrder)}
        order={invoiceOrder}
        onClose={() => {
          setInvoiceOrder(null);
          if (returnToDetailsOrder) {
            setSelectedOrder(returnToDetailsOrder);
            setReturnToDetailsOrder(null);
          }
        }}
      />
    </div>
  );
}

