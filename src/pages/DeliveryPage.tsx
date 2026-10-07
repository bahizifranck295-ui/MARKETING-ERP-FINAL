import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Truck,
  CheckCircle2,
  MapPin,
  Loader2,
  Send,
  FileText,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, StatusBadge, fmtDate } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import InvoiceModal, { InvoiceData } from "@/components/InvoiceModal";

export default function DeliveryPage() {
  const { has } = useAuth();
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [invoiceOrder, setInvoiceOrder] = useState<InvoiceData | null>(null);

  const loadDeliveries = async () => {
    setLoading(true);
    try {
      const res = await api.get("/delivery/tours");
      setDeliveries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur chargement livraisons"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    setBusyId(id);
    try {
      await api.put(`/delivery/tours/${id}/status`, { status: newStatus });
      toast.success(
        newStatus === "delivered"
          ? "Livraison confirmée comme terminée !"
          : `Statut mis à jour : ${newStatus}`
      );
      loadDeliveries();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec mise à jour"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Gestion des Livraisons & Tournées"
        subtitle="Expédition des commandes, chargements et confirmations de livraison"
      />
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : deliveries.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="Aucune tournée de livraison"
          subtitle="Toutes les commandes validées ont été livrées."
        />
      ) : (
        <div className="space-y-3">
          {deliveries.map((del) => {
            const isDelivered = del.status === "delivered";
            return (
              <div
                key={del.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-800">
                        {del.code || `LIV-${del.id.slice(0, 6)}`}
                      </span>
                      <StatusBadge status={del.status} />
                      <span className="text-xs text-slate-400">
                        • {fmtDate(del.created_at)}
                      </span>
                    </div>
                    <div className="text-sm font-bold text-slate-900">
                      Client : {del.client_name}
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span>{del.destination || del.address || "Adresse du client"}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-2 sm:pt-0">
                    {(del.order_id || del.order_code) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setInvoiceOrder({
                            id: del.order_id,
                            code: del.order_code || `CMD-${del.id.slice(0, 6)}`,
                            client_name: del.client_name,
                            client_phone: del.client_phone,
                            delivery_address: del.address || del.destination,
                            created_at: del.created_at,
                            total: del.total || 0,
                            items: del.items || [],
                          })
                        }
                        className="h-9 rounded-xl border-slate-200 text-slate-700 hover:text-[#0F3D68] text-xs font-semibold px-2.5"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1 text-[#0F3D68]" /> Facture
                      </Button>
                    )}
                    {!isDelivered && (
                      <Button
                        size="sm"
                        onClick={() => handleUpdateStatus(del.id, "delivered")}
                        disabled={busyId === del.id}
                        className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1.5" /> Confirmer Livré
                      </Button>
                    )}
                    {del.status === "pending" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUpdateStatus(del.id, "shipped")}
                        disabled={busyId === del.id}
                        className="h-9 rounded-xl border-slate-200 text-xs"
                      >
                        <Send className="h-4 w-4 mr-1.5" /> En cours d'acheminement
                      </Button>
                    )}
                  </div>
                </div>
                {del.items && del.items.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 text-xs text-slate-600">
                    <span className="font-semibold text-slate-700">Articles à livrer : </span>
                    {del.items.map((i: any) => `${i.product_name} (${i.quantity})`).join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* FACTURE UNIFIÉE */}
      <InvoiceModal
        isOpen={Boolean(invoiceOrder)}
        order={invoiceOrder}
        onClose={() => setInvoiceOrder(null)}
      />
    </div>
  );
}
