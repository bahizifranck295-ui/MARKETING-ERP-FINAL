import React, { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  Coins,
  Search,
  CheckCircle2,
  Loader2,
  Users,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { fmtMoney, fmtDate } from "@/components/erp-ui";
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
import {
  generateCashReceiptPdf,
  CashReceiptData,
  CashReceiptBilletage,
} from "@/lib/generateCashReceiptPdf";

interface Order {
  id: string;
  code: string;
  client_id: string;
  client_name: string;
  client_phone?: string;
  marketer_id?: string;
  marketer_name?: string;
  total: number;
  total_fc?: number;
  created_at: string;
}

interface InflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  marketers: any[];
  clients: any[];
  debts: any[];
  exchangeRate: number;
  userName: string;
  onOpenBilletageForOrder: (order: Order) => void;
  onSuccessSlip: (receiptData: CashReceiptData, url: string, title: string) => void;
  onRefresh: () => void;
}

export default function InflowModal({
  isOpen,
  onClose,
  marketers,
  clients,
  debts,
  exchangeRate,
  userName,
  onOpenBilletageForOrder,
  onSuccessSlip,
  onRefresh,
}: InflowModalProps) {
  const [nature, setNature] = useState("Versement journalier de marketeur dans les différents comptes clients");
  // Catégorie de produits de l'encaissement : son taux (Caisse › Taux) s'applique à la transaction
  const [department, setDepartment] = useState("");
  const [rate, setRate] = useState(exchangeRate || 2500);
  const [availableDepartments, setAvailableDepartments] = useState<string[]>([]);
  const [ratesConfig, setRatesConfig] = useState<any>(null);

  React.useEffect(() => {
    if (isOpen) {
      api.get("/cash/rates")
        .then((res) => {
          if (res.data) {
            setRatesConfig(res.data);
            const cats: string[] = Array.isArray(res.data.categories) ? res.data.categories : [];
            setAvailableDepartments(cats);
            const dept = cats.includes(department) ? department : cats[0] || "";
            setDepartment(dept);
            const catRate = res.data.category_rates?.[dept] || res.data.general_rate || exchangeRate || 2500;
            setRate(catRate);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const handleDepartmentChange = (dept: string) => {
    setDepartment(dept);
    const catRate = ratesConfig?.category_rates?.[dept] || ratesConfig?.general_rate || exchangeRate || 2500;
    setRate(catRate);
  };
  const [marketerName, setMarketerName] = useState("");
  const [marketerOrders, setMarketerOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  // Direct client debt
  const [debtSearch, setDebtSearch] = useState("");
  const [selectedDebtor, setSelectedDebtor] = useState<any | null>(null);
  const [directBilletUSD, setDirectBilletUSD] = useState<Record<string, number>>({
    "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0,
  });
  const [directBilletCDF, setDirectBilletCDF] = useState<Record<string, number>>({
    "20000": 0, "10000": 0, "5000": 0, "1000": 0, "500": 0, "200": 0, "100": 0, "50": 0,
  });

  // Apport / Autre
  const [verseurName, setVerseurName] = useState("");
  const [motif, setMotif] = useState("");
  const [generalBilletUSD, setGeneralBilletUSD] = useState<Record<string, number>>({
    "100": 0, "50": 0, "20": 0, "10": 0, "5": 0, "1": 0,
  });
  const [generalBilletCDF, setGeneralBilletCDF] = useState<Record<string, number>>({
    "20000": 0, "10000": 0, "5000": 0, "1000": 0, "500": 0, "200": 0, "100": 0, "50": 0,
  });
  const [processing, setProcessing] = useState(false);

  const isMarketer = nature.includes("marketeur") || nature.includes("versement journalier");
  const isDirectClient = nature.includes("Règlement direct");
  const isApport = nature.includes("Apport de fonds");
  const isAutre = nature.includes("Autre encaissement");

  const handleMarketerChange = async (mName: string) => {
    setMarketerName(mName);
    if (!mName) {
      setMarketerOrders([]);
      return;
    }
    setLoadingOrders(true);
    try {
      const res = await api.get(`/cash/marketer-orders/${encodeURIComponent(mName)}`);
      setMarketerOrders(Array.isArray(res.data) ? res.data : []);
    } catch {
      setMarketerOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const clientsWithDebt = useMemo(() => {
    const map = new Map<string, any>();
    debts.forEach((d) => {
      const rem = d.remaining !== undefined ? d.remaining : d.balance !== undefined ? d.balance : (d.initial_amount || 0) - (d.paid || 0);
      if (rem > 0) {
        map.set(d.client_id || d.id, {
          id: d.id,
          client_id: d.client_id || d.id,
          client_name: d.client_name || "Client",
          client_phone: d.client_phone || "+243 000 000 000",
          client_code: d.client_code || "CLI",
          department: d.department || "Maize Mill",
          debt_amount_usd: rem,
          marketer_name: d.marketer_name,
        });
      }
    });
    clients.forEach((c) => {
      const debt = c.current_credit && c.current_credit > 0 ? c.current_credit : c.balance && c.balance < 0 ? Math.abs(c.balance) : 0;
      if (debt > 0 && !map.has(c.id)) {
        map.set(c.id, {
          id: `crd-${c.id}`,
          client_id: c.id,
          client_name: c.name,
          client_phone: c.phone || "+243 000 000 000",
          client_code: c.code || "CLI",
          department: c.department || "Maize Mill",
          debt_amount_usd: debt,
          marketer_name: c.marketer_name,
        });
      }
    });
    return Array.from(map.values());
  }, [debts, clients]);

  const filteredDebtors = useMemo(() => {
    const q = debtSearch.trim().toLowerCase();
    if (!q) return clientsWithDebt;
    return clientsWithDebt.filter(
      (d) =>
        d.client_name?.toLowerCase().includes(q) ||
        d.client_phone?.toLowerCase().includes(q) ||
        d.client_code?.toLowerCase().includes(q)
    );
  }, [clientsWithDebt, debtSearch]);

  const totalDirectUSD = useMemo(() => {
    return Object.entries(directBilletUSD).reduce((sum, [d, c]) => sum + (Number(d) || 0) * (Number(c) || 0), 0);
  }, [directBilletUSD]);

  const totalDirectCDF = useMemo(() => {
    return Object.entries(directBilletCDF).reduce((sum, [d, c]) => sum + (Number(d) || 0) * (Number(c) || 0), 0);
  }, [directBilletCDF]);

  const totalDirectCalcUSD = useMemo(() => {
    const cdfInUSD = totalDirectCDF > 0 ? Math.round((totalDirectCDF / rate) * 100) / 100 : 0;
    return Math.round((totalDirectUSD + cdfInUSD) * 100) / 100;
  }, [totalDirectUSD, totalDirectCDF, rate]);

  const handleConfirmDirectDebt = async () => {
    if (!selectedDebtor) return;
    if (totalDirectCalcUSD <= 0) {
      toast.error("Veuillez renseigner les coupures physiques reçues.");
      return;
    }
    setProcessing(true);
    try {
      const ref = `ENC-${Date.now().toString().slice(-6)}`;
      const billetageData: CashReceiptBilletage = {
        usd: directBilletUSD,
        cdf: directBilletCDF,
        total_usd: totalDirectUSD,
        total_cdf: totalDirectCDF,
        exchange_rate: rate,
      };
      const receiptData: CashReceiptData = {
        operationReference: ref,
        operationType: "in",
        category: "RÈGLEMENT DIRECT CLIENT",
        amount: totalDirectCalcUSD,
        currency: "USD",
        amountUSD: totalDirectCalcUSD,
        amountCDF: totalDirectCDF,
        exchangeRate: rate,
        date: new Date(),
        agentName: userName || "Caissier",
        department,
        clientName: selectedDebtor.client_name,
        clientCode: selectedDebtor.client_code,
        reason: `Règlement direct de créance pour ${selectedDebtor.client_name}`,
        billetage: billetageData,
      };
      const { dataUrl, fileName } = await generateCashReceiptPdf(receiptData);
      await api.post(`/clients/${selectedDebtor.client_id}/payments`, {
        amount: totalDirectCalcUSD,
        currency: "USD",
        exchange_rate: rate,
        department,
        payment_method: "cash",
        notes: receiptData.reason,
        reference: ref,
        billetage: billetageData,
        document_url: dataUrl,
        document_name: fileName,
      });

      toast.success(`Règlement de ${fmtMoney(totalDirectCalcUSD, "USD")} enregistré !`);
      onSuccessSlip(receiptData, dataUrl, "Bordereau Officiel de Règlement Client");
      onRefresh();
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Échec du règlement"));
    } finally {
      setProcessing(false);
    }
  };

  const totalGeneralUSD = useMemo(() => {
    return Object.entries(generalBilletUSD).reduce((sum, [d, c]) => sum + (Number(d) || 0) * (Number(c) || 0), 0);
  }, [generalBilletUSD]);

  const totalGeneralCDF = useMemo(() => {
    return Object.entries(generalBilletCDF).reduce((sum, [d, c]) => sum + (Number(d) || 0) * (Number(c) || 0), 0);
  }, [generalBilletCDF]);

  const totalGeneralCalcUSD = useMemo(() => {
    const cdfInUSD = totalGeneralCDF > 0 ? Math.round((totalGeneralCDF / rate) * 100) / 100 : 0;
    return Math.round((totalGeneralUSD + cdfInUSD) * 100) / 100;
  }, [totalGeneralUSD, totalGeneralCDF, rate]);

  const handleConfirmGeneralInflow = async (cat: string, prefix: string) => {
    if (!verseurName.trim()) {
      toast.error("Veuillez renseigner le nom du verseur.");
      return;
    }
    if (totalGeneralCalcUSD <= 0 && totalGeneralCDF <= 0) {
      toast.error("Veuillez renseigner les coupures dans le billetage.");
      return;
    }
    setProcessing(true);
    try {
      const ref = `${prefix}-${Date.now().toString().slice(-6)}`;
      const billetageData: CashReceiptBilletage = {
        usd: generalBilletUSD,
        cdf: generalBilletCDF,
        total_usd: totalGeneralUSD,
        total_cdf: totalGeneralCDF,
        exchange_rate: rate,
      };
      const receiptData: CashReceiptData = {
        operationReference: ref,
        operationType: "in",
        category: cat,
        amount: totalGeneralCalcUSD,
        currency: "USD",
        amountUSD: totalGeneralCalcUSD,
        amountCDF: totalGeneralCDF,
        exchangeRate: rate,
        date: new Date(),
        agentName: userName || "Caissier",
        department,
        clientName: verseurName.trim(),
        reason: motif.trim() || `${cat} par ${verseurName.trim()}`,
        billetage: billetageData,
      };
      const { dataUrl, fileName } = await generateCashReceiptPdf(receiptData);
      await api.post("/cash/operations", {
        type: "in",
        category: cat,
        amount: totalGeneralCalcUSD,
        currency: "USD",
        exchange_rate: rate,
        department,
        payment_method: "cash",
        client_name: verseurName.trim(),
        reason: receiptData.reason,
        reference: ref,
        billetage: billetageData,
        document_url: dataUrl,
        document_name: fileName,
      });

      toast.success(`${cat} de ${fmtMoney(totalGeneralCalcUSD, "USD")} enregistré !`);
      onSuccessSlip(receiptData, dataUrl, `Bordereau Officiel : ${cat}`);
      onRefresh();
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur enregistrement encaissement"));
    } finally {
      setProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <ArrowDownLeft className="h-5 w-5 text-emerald-600" />
            Enregistrer une Entrée de Caisse
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          <div>
            <Label className="text-xs font-semibold text-slate-700">Nature de l'Entrée</Label>
            <select
              value={nature}
              onChange={(e) => {
                setNature(e.target.value);
                setSelectedDebtor(null);
                setVerseurName("");
                setMotif("");
              }}
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold shadow-xs focus:border-brand focus:outline-none"
            >
              <option value="Versement journalier de marketeur dans les différents comptes clients">
                1. Versement journalier de marketeur dans les différents comptes clients
              </option>
              <option value="Règlement direct client">
                2. Règlement direct client
              </option>
              <option value="Apport de fonds en caisse">
                3. Apport de fonds en caisse
              </option>
              <option value="Autre encaissement">
                4. Autre encaissement
              </option>
            </select>
          </div>

          {/* Le taux est celui de la catégorie (Caisse › Taux) : il n'est pas modifiable ici */}
          <div className="grid grid-cols-1 gap-4">
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-700">Département / Catégorie</Label>
                <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-200">
                  Taux fixe d'entrée : 1$ = {rate.toLocaleString("fr-FR")} FC
                </span>
              </div>
              <select
                value={department}
                onChange={(e) => handleDepartmentChange(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs shadow-xs focus:border-brand focus:outline-none"
              >
                {availableDepartments.map((dept) => (
                  <option key={dept} value={dept}>
                    {dept}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 1. VERSEMENT JOURNALIER MARKETEUR */}
          {isMarketer && (
            <div className="space-y-4 pt-1">
              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Sélection du Marketeur <span className="text-rose-500">*</span>
                </Label>
                <select
                  value={marketerName}
                  onChange={(e) => handleMarketerChange(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium shadow-xs focus:border-brand focus:outline-none"
                >
                  <option value="">-- Choisir un marketeur --</option>
                  {marketers.map((m) => (
                    <option key={m.id} value={m.full_name}>
                      {m.full_name} ({m.department || "Ventes"})
                    </option>
                  ))}
                </select>
              </div>

              {marketerName && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        Commandes non encore versées pour {marketerName}
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Cliquez sur <strong>"Encaisser"</strong> pour ouvrir le billetage physique et valider la commande.
                      </p>
                    </div>
                    <span className="text-xs font-bold bg-brand/10 text-brand px-2.5 py-1 rounded-md">
                      {marketerOrders.length} commande(s)
                    </span>
                  </div>

                  {loadingOrders ? (
                    <div className="py-8 text-center text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-1 text-brand" />
                      Recherche des commandes...
                    </div>
                  ) : marketerOrders.length === 0 ? (
                    <div className="py-6 text-center text-slate-500 bg-white rounded-lg border border-slate-200 text-xs">
                      Aucune commande espèces en attente pour ce marketeur.
                    </div>
                  ) : (
                    <div className="bg-white rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                      {marketerOrders.map((ord) => (
                        <div
                          key={ord.id}
                          className="p-3 flex items-center justify-between hover:bg-slate-50 transition-colors"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900">{ord.client_name}</span>
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                {ord.code}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              Date : {fmtDate(ord.created_at)}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs font-bold text-slate-900">
                                {fmtMoney(ord.total, "USD")}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => onOpenBilletageForOrder(ord)}
                              className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-xs"
                            >
                              <Coins className="h-3.5 w-3.5 mr-1" />
                              Encaisser
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 2. RÈGLEMENT DIRECT CLIENT */}
          {isDirectClient && (
            <div className="space-y-4 pt-1">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Users className="h-4 w-4 text-brand" /> CLIENTS AYANT UNE DETTE
                  </h4>
                  <span className="text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-lg">
                    {filteredDebtors.length} débiteur(s)
                  </span>
                </div>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={debtSearch}
                    onChange={(e) => setDebtSearch(e.target.value)}
                    placeholder="Rechercher par nom, téléphone, code..."
                    className="pl-9 text-xs h-9 bg-white"
                  />
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl bg-white shadow-2xs">
                {filteredDebtors.map((deb) => {
                  const isSelected = selectedDebtor?.client_id === deb.client_id;
                  return (
                    <div
                      key={deb.client_id}
                      onClick={() => {
                        setSelectedDebtor(deb);
                        const debt = Number(deb.debt_amount_usd) || 0;
                        setDirectBilletUSD({
                          "100": Math.floor(debt / 100),
                          "50": 0, "20": 0, "10": 0, "5": 0, "1": 0,
                        });
                      }}
                      className={`p-3 flex items-center justify-between cursor-pointer transition-all ${
                        isSelected ? "bg-blue-50/80 border-l-4 border-l-brand" : "hover:bg-slate-50"
                      }`}
                    >
                      <div>
                        <div className="font-bold text-slate-900">{deb.client_name} ({deb.client_code})</div>
                        <div className="text-[11px] text-slate-500">Tél : {deb.client_phone}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-black text-rose-700">{fmtMoney(deb.debt_amount_usd, "USD")}</div>
                        <Button size="sm" variant={isSelected ? "default" : "outline"} className="h-6 text-[10px] mt-1">
                          {isSelected ? "Sélectionné" : "Choisir"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {selectedDebtor && (
                <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-200 space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-800">
                      Règlement pour : {selectedDebtor.client_name} (Dette : {fmtMoney(selectedDebtor.debt_amount_usd, "USD")})
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-lg border">
                    <div>
                      <span className="font-bold text-emerald-800 block mb-1">Billets USD</span>
                      {[100, 50, 20, 10, 5, 1].map((val) => (
                        <div key={val} className="flex justify-between items-center py-0.5">
                          <span>${val}</span>
                          <Input
                            type="number"
                            min="0"
                            value={directBilletUSD[String(val)] || ""}
                            onChange={(e) =>
                              setDirectBilletUSD({
                                ...directBilletUSD,
                                [String(val)]: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="h-6 w-16 text-center text-xs"
                            placeholder="0"
                          />
                        </div>
                      ))}
                    </div>
                    <div>
                      <span className="font-bold text-blue-800 block mb-1">Billets CDF</span>
                      {[20000, 10000, 5000, 1000, 500].map((val) => (
                        <div key={val} className="flex justify-between items-center py-0.5">
                          <span>{val} FC</span>
                          <Input
                            type="number"
                            min="0"
                            value={directBilletCDF[String(val)] || ""}
                            onChange={(e) =>
                              setDirectBilletCDF({
                                ...directBilletCDF,
                                [String(val)]: Math.max(0, parseInt(e.target.value) || 0),
                              })
                            }
                            className="h-6 w-16 text-center text-xs"
                            placeholder="0"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-between items-center pt-2">
                    <span className="font-bold">Total Reçu : {fmtMoney(totalDirectCalcUSD, "USD")}</span>
                    <Button
                      size="sm"
                      onClick={handleConfirmDirectDebt}
                      disabled={processing || totalDirectCalcUSD <= 0}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                    >
                      {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                      Valider Règlement & Bordereau
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 3 & 4. APPORT DE FONDS OU AUTRE */}
          {(isApport || isAutre) && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-semibold">Nom du verseur *</Label>
                  <Input
                    value={verseurName}
                    onChange={(e) => setVerseurName(e.target.value)}
                    placeholder="Nom du déposant"
                    className="mt-1 h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Motif / Description *</Label>
                  <Input
                    value={motif}
                    onChange={(e) => setMotif(e.target.value)}
                    placeholder={isApport ? "Fonds de roulement..." : "Prestation..."}
                    className="mt-1 h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 bg-white p-3 rounded-lg border">
                <div>
                  <span className="font-bold text-emerald-800 block mb-1">Billets USD</span>
                  {[100, 50, 20, 10, 5, 1].map((val) => (
                    <div key={val} className="flex justify-between items-center py-0.5">
                      <span>${val}</span>
                      <Input
                        type="number"
                        min="0"
                        value={generalBilletUSD[String(val)] || ""}
                        onChange={(e) =>
                          setGeneralBilletUSD({
                            ...generalBilletUSD,
                            [String(val)]: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="h-6 w-16 text-center text-xs"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <span className="font-bold text-blue-800 block mb-1">Billets CDF</span>
                  {[20000, 10000, 5000, 1000, 500].map((val) => (
                    <div key={val} className="flex justify-between items-center py-0.5">
                      <span>{val} FC</span>
                      <Input
                        type="number"
                        min="0"
                        value={generalBilletCDF[String(val)] || ""}
                        onChange={(e) =>
                          setGeneralBilletCDF({
                            ...generalBilletCDF,
                            [String(val)]: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="h-6 w-16 text-center text-xs"
                        placeholder="0"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <span className="font-bold">Total Reçu : {fmtMoney(totalGeneralCalcUSD, "USD")}</span>
                <Button
                  size="sm"
                  onClick={() => handleConfirmGeneralInflow(isApport ? "Apport de fonds en caisse" : "Autre encaissement", isApport ? "APP" : "AUT")}
                  disabled={processing || !verseurName.trim() || totalGeneralCalcUSD <= 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                >
                  {processing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                  Valider & Générer le Bordereau
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
