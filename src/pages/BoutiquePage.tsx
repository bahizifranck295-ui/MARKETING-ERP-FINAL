import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Store,
  ShoppingBag,
  ShoppingCart,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  Loader2,
  RefreshCw,
  FileText,
  Shapes,
} from "lucide-react";
import { api, extractErrorMessage } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader, EmptyState, StatusBadge, fmtMoney, fmtDate } from "@/components/erp-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import InvoiceModal from "@/components/InvoiceModal";
import NewProductDialog from "@/components/stock/NewProductDialog";
import { CategoriesPanel } from "@/components/stock/categories";

export default function BoutiquePage() {
  const { user, has, hasAny } = useAuth();
  // Mêmes formulaires que le module Stock : nouveau produit et catégories
  const [newProductOpen, setNewProductOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [stockProducts, setStockProducts] = useState<any[]>([]);
  const openCategories = async () => {
    setCategoriesOpen(true);
    try {
      const { data } = await api.get("/integration/catalog");
      setStockProducts(Array.isArray(data) ? data : []);
    } catch {
      setStockProducts([]);
    }
  };
  const [tab, setTab] = useState("catalog");
  const [products, setProducts] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [myOrders, setMyOrders] = useState<any[]>([]);
  const [marketers, setMarketers] = useState<any[]>([]);
  const [selectedMarketerId, setSelectedMarketerId] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [ordersSearch, setOrdersSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Cart state
  const [cart, setCart] = useState<Record<string, number>>({});
  const [clientId, setClientId] = useState("");
  const [clientType, setClientType] = useState("existing");
  const [walkName, setWalkName] = useState("");
  const [walkPhone, setWalkPhone] = useState("");
  const [currency, setCurrency] = useState("CDF");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [orderNotes, setOrderNotes] = useState("");
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [cartDrawerOpen, setCartDrawerOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [ratesConfig, setRatesConfig] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [prodRes, myOrdersRes, clientsRes, marketersRes, ratesRes] = await Promise.all([
        api.get("/boutique/products"),
        has("boutique.orders_history") ? api.get("/boutique/my-orders") : Promise.resolve({ data: [] }),
        has("boutique.order") ? api.get("/clients").catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        api.get("/boutique/marketers").catch(() => ({ data: [] })),
        api.get("/cash/rates").catch(() => ({ data: null })),
      ]);
      setProducts(Array.isArray(prodRes.data) ? prodRes.data : []);
      setMyOrders(Array.isArray(myOrdersRes.data) ? myOrdersRes.data : []);
      setClients(Array.isArray(clientsRes.data) ? clientsRes.data : []);
      setMarketers(Array.isArray(marketersRes.data) ? marketersRes.data : []);
      if (ratesRes.data) setRatesConfig(ratesRes.data);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Erreur lors du chargement de la boutique"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["all", ...Array.from(set)];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCat = selectedCategory === "all" || p.category === selectedCategory;
      const q = search.trim().toLowerCase();
      const matchQ =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.code && p.code.toLowerCase().includes(q));
      return matchCat && matchQ;
    });
  }, [products, selectedCategory, search]);

  const updateCartQty = (productId: string, delta: number) => {
    setCart((prev) => {
      const current = prev[productId] || 0;
      const next = current + delta;
      const product = products.find((p) => p.id === productId);
      if (next <= 0) {
        const copy = { ...prev };
        delete copy[productId];
        return copy;
      }
      // Produit marqué « Indisponible » (Boutique › Catégories) : il ne peut pas être commandé
      if (product && product.available === false && delta > 0) {
        toast.error(`Produit indisponible : ${product.name}. Il ne peut pas être commandé pour le moment.`);
        return prev;
      }
      return { ...prev, [productId]: next };
    });
  };

  const clearCart = () => setCart({});

  const cartSummary = useMemo(() => {
    let totalUSD = 0;
    let totalCDF = 0;
    let totalItemsCount = 0;
    const lines: any[] = [];

    Object.entries(cart).forEach(([productId, qty]) => {
      if (qty <= 0) return;
      const p = products.find((prod) => prod.id === productId);
      if (!p) return;
      const categoryRate = ratesConfig?.category_rates?.[p.category] || ratesConfig?.general_rate || 2500;
      const priceUSD = p.sell_price || 0;
      // Prix en FC au taux de la catégorie (Caisse › Taux), comme sur la fiche produit
      const priceCDF = Math.round(priceUSD * categoryRate);
      const lineUSD = priceUSD * qty;
      const lineCDF = priceCDF * qty;
      totalUSD += lineUSD;
      totalCDF += lineCDF;
      totalItemsCount += qty;
      lines.push({
        product: p,
        quantity: qty,
        unit_price: priceUSD,
        unit_price_fc: priceCDF,
        line_total: lineUSD,
        line_total_fc: lineCDF,
      });
    });

    return { totalUSD, totalCDF, totalItemsCount, lines };
  }, [cart, products, ratesConfig]);

  const handleSendOrder = async () => {
    if (cartSummary.lines.length === 0) {
      toast.error("Votre panier est vide");
      return;
    }
    if (clientType === "existing" && !clientId) {
      toast.error("Veuillez sélectionner un client");
      return;
    }
    if (clientType === "walkin" && !walkName.trim()) {
      toast.error("Veuillez renseigner le nom du client");
      return;
    }
    setSubmittingOrder(true);
    try {
      const payload = {
        client_id: clientType === "existing" ? clientId : undefined,
        client_name: clientType === "walkin" ? walkName.trim() : undefined,
        client_phone: clientType === "walkin" ? walkPhone.trim() : undefined,
        source: "boutique",
        currency: currency === "CDF" ? "CDF" : "USD",
        payment_method: paymentMethod,
        notes: orderNotes.trim() || "Commande passée via le module Boutique Revendeur",
        items: cartSummary.lines.map((l) => ({
          product_id: l.product.id,
          quantity: l.quantity,
          unit_price: l.unit_price,
          unit_price_fc: l.unit_price_fc,
          discount: 0,
        })),
      };
      const res = await api.post("/orders", payload);
      toast.success("Commande envoyée avec succès au responsable pour approbation !");
      clearCart();
      setCartDrawerOpen(false);
      setOrderNotes("");
      loadData();
      if (has("boutique.orders_history")) setTab("my-orders");
      if (res.data && has("orders.print")) {
        setViewingOrder(res.data);
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, "Impossible d'envoyer la commande"));
    } finally {
      setSubmittingOrder(false);
    }
  };

  const filteredOrders = useMemo(() => {
    return myOrders.filter((ord) => {
      const matchStatus = statusFilter === "all" || ord.status === statusFilter;
      const matchMarketer =
        selectedMarketerId === "all" || ord.marketer_id === selectedMarketerId;
      const q = ordersSearch.trim().toLowerCase();
      const matchQ =
        !q ||
        ord.code.toLowerCase().includes(q) ||
        (ord.client_name && ord.client_name.toLowerCase().includes(q)) ||
        (ord.marketer_name && ord.marketer_name.toLowerCase().includes(q));
      return matchStatus && matchMarketer && matchQ;
    });
  }, [myOrders, statusFilter, selectedMarketerId, ordersSearch]);

  return (
    <div className="space-y-4 relative">
      <PageHeader
        title="Boutique"
        subtitle="Catalogue produits, vente directe & suivi de mes commandes"
        right={
          (hasAny(["categories.manage", "products.availability", "products.delete"]) || has("products.create")) && (
            <div className="flex flex-wrap items-center gap-2" data-boutique-stock-actions>
              {hasAny(["categories.manage", "products.availability", "products.delete"]) && (
                <Button size="sm" variant="outline" onClick={openCategories} className="h-9 rounded-xl border-slate-200 font-bold text-[#0F3D68]">
                  <Shapes className="mr-1.5 h-4 w-4" /> Catégories
                </Button>
              )}
              {has("products.create") && (
                <Button size="sm" onClick={() => setNewProductOpen(true)} className="h-9 rounded-xl bg-[#0F3D68] font-bold text-white hover:bg-[#0B2F52]">
                  <Plus className="mr-1.5 h-4 w-4" /> Nouveau produit
                </Button>
              )}
            </div>
          )
        }
      />
      {newProductOpen && <NewProductDialog onClose={() => setNewProductOpen(false)} onCreated={loadData} />}
      {categoriesOpen && (
        <Dialog open onOpenChange={() => setCategoriesOpen(false)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base flex items-center gap-2">
                <Shapes className="w-5 h-5 text-[#0F3D68]" /> Catégories de produits
              </DialogTitle>
            </DialogHeader>
            <CategoriesPanel products={stockProducts} onChanged={() => { loadData(); openCategories(); }} />
          </DialogContent>
        </Dialog>
      )}

      {/* Floating cart bubble */}
      {cartSummary.totalItemsCount > 0 && (
        <button
          type="button"
          onClick={() => setCartDrawerOpen(true)}
          className="fixed bottom-20 lg:bottom-8 right-4 sm:right-8 z-50 group flex flex-col items-center justify-center w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-[#0F3D68] via-[#1E70BF] to-purple-800 text-white shadow-2xl hover:shadow-purple-600/50 hover:scale-105 active:scale-95 transition-all duration-300 border-4 border-white ring-4 ring-purple-500/30 cursor-pointer select-none p-2 text-center"
          title="Ouvrir le panier pour finaliser la commande"
        >
          <span className="absolute -top-1 -right-1 bg-amber-400 text-slate-950 font-black text-xs min-w-[26px] h-6.5 px-1.5 rounded-full flex items-center justify-center border-2 border-white shadow-md">
            {cartSummary.totalItemsCount}
          </span>
          <ShoppingCart className="w-7 h-7 sm:w-8 sm:h-8 text-amber-300 drop-shadow group-hover:scale-110 transition-transform" />
          <div className="text-[10px] sm:text-[11px] font-bold text-blue-100 tracking-tight leading-none mt-1">
            {cartSummary.totalItemsCount} {cartSummary.totalItemsCount > 1 ? "produits" : "produit"}
          </div>
          <div className="text-xs sm:text-[13px] font-black text-white text-center leading-tight tracking-tight px-1 drop-shadow-sm mt-0.5 max-w-[95%] truncate">
            {currency === "CDF"
              ? `${cartSummary.totalCDF.toLocaleString("fr-FR")} FC`
              : fmtMoney(cartSummary.totalUSD, "USD")}
          </div>
          <div className="text-[8px] sm:text-[9px] uppercase tracking-wider font-extrabold text-amber-300/90 leading-none mt-1 group-hover:text-amber-200">
            Voir panier →
          </div>
        </button>
      )}

      {/* Navigation Tabs */}
      <div className={`grid ${has("boutique.orders_history") ? "grid-cols-2" : "grid-cols-1"} gap-2 p-1 bg-white border border-slate-200 rounded-2xl`}>
        <button
          onClick={() => setTab("catalog")}
          className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
            tab === "catalog"
              ? "bg-[#0F3D68] text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <Store className="h-4 w-4" />
          <span>Produit & Vente</span>
        </button>
        {has("boutique.orders_history") && (
        <button
          onClick={() => setTab("my-orders")}
          className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all relative ${
            tab === "my-orders"
              ? "bg-[#0F3D68] text-white shadow-xs"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
          }`}
        >
          <ShoppingBag className="h-4 w-4" />
          <span>Mes Commandes</span>
          {myOrders.length > 0 && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                tab === "my-orders" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-700"
              }`}
            >
              {myOrders.length}
            </span>
          )}
        </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
        </div>
      ) : (
        <>
          {tab === "catalog" && (
            <div className="space-y-4">
              {has("boutique.search") && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Rechercher un produit..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9 h-11 bg-white rounded-xl"
                  />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors whitespace-nowrap ${
                        selectedCategory === cat
                          ? "bg-[#0F3D68] text-white border-[#0F3D68]"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {cat === "all" ? "Toutes catégories" : <span data-no-translate>{cat}</span>}
                    </button>
                  ))}
                </div>
              </div>
              )}

              {filteredProducts.length === 0 ? (
                <EmptyState
                  icon={Store}
                  title="Aucun produit trouvé"
                  subtitle="Essayez un autre mot-clé ou catégorie"
                />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {filteredProducts.map((product) => {
                    const inStock = product.available !== false;
                    const qtyInCart = cart[product.id] || 0;
                    const categoryRate = ratesConfig?.category_rates?.[product.category] || ratesConfig?.general_rate || 2500;
                    const priceUSD = product.sell_price || 0;
                    const priceFC = Math.round(priceUSD * categoryRate);

                    return (
                      <div
                        key={product.id}
                        className={`rounded-2xl border bg-white flex flex-col justify-between overflow-hidden transition-all hover:shadow-md ${
                          qtyInCart > 0 ? "border-purple-500 ring-2 ring-purple-200" : "border-slate-200"
                        }`}
                      >
                        <div className="relative h-36 bg-white overflow-hidden group">
                          {product.image_url ? (
                            /* Photo affichée en entier (sans être coupée par le bord du cadre) */
                            <img
                              src={product.image_url}
                              alt={product.name}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300"
                              onError={(e) => {
                                (e.target as any).src =
                                  "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=600&auto=format&fit=crop&q=80";
                              }}
                            />
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center text-slate-300 bg-slate-50">
                              <Store className="w-10 h-10 mb-1 opacity-40" />
                              <span className="text-[10px] text-slate-400">Visuel standard</span>
                            </div>
                          )}
                          <div className="absolute top-2.5 left-2.5 flex flex-col gap-1 items-start">
                            <span className="font-mono text-[9px] font-bold px-2 py-0.5 rounded-full bg-black/60 text-white backdrop-blur-xs">
                              {product.code}
                            </span>
                            {product.badge && (
                              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-purple-600 text-white shadow-xs">
                                {product.badge}
                              </span>
                            )}
                          </div>
                          <span
                            data-availability-badge
                            className={`absolute top-2.5 right-2.5 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-xs ${
                              !inStock
                                ? "bg-red-500 text-white"
                                : "bg-emerald-600 text-white"
                            }`}
                          >
                            {!inStock ? "Indisponible" : "Disponible"}
                          </span>
                        </div>

                        <div className="p-3.5 flex-1 flex flex-col justify-between">
                          <div>
                            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                              {product.category ? <span data-no-translate>{product.category}</span> : "Boisson & Alimentaire"}
                            </div>
                            <h3 className="font-bold text-slate-900 text-sm mt-0.5 leading-snug line-clamp-2">
                              {product.name}
                            </h3>
                          </div>

                          <div className="mt-3 pt-3 border-t border-slate-100 flex items-end justify-between gap-2">
                            <div>
                              <div className="font-extrabold text-slate-900 text-base leading-tight">
                                {currency === "CDF"
                                  ? `${priceFC.toLocaleString("fr-FR")} FC`
                                  : fmtMoney(priceUSD, "USD")}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {currency === "CDF" ? fmtMoney(priceUSD, "USD") : `${priceFC.toLocaleString("fr-FR")} FC`}
                              </div>
                              <div className="text-[10px] font-semibold text-blue-700 bg-blue-50/80 px-1.5 py-0.5 rounded inline-block mt-1">
                                Taux : 1$ = {categoryRate.toLocaleString("fr-FR")} FC
                              </div>
                            </div>

                            {!has("boutique.order") ? null : inStock ? (
                              qtyInCart > 0 ? (
                                <div className="flex items-center gap-1.5 bg-purple-50 border border-purple-200 rounded-xl p-1 shrink-0">
                                  <button
                                    onClick={() => updateCartQty(product.id, -1)}
                                    className="h-7 w-7 rounded-lg bg-white shadow-xs flex items-center justify-center text-purple-800 font-bold hover:bg-purple-100 transition-colors"
                                  >
                                    <Minus className="h-3 w-3" />
                                  </button>
                                  <span className="font-bold text-xs text-purple-900 min-w-[20px] text-center">
                                    {qtyInCart}
                                  </span>
                                  <button
                                    onClick={() => updateCartQty(product.id, 1)}
                                    className="h-7 w-7 rounded-lg bg-purple-700 text-white flex items-center justify-center hover:bg-purple-800 transition-colors"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </button>
                                </div>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => updateCartQty(product.id, 1)}
                                  className="h-8 rounded-xl bg-[#0F3D68] hover:bg-[#0B2F52] text-xs shadow-xs"
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" /> Ajouter
                                </Button>
                              )
                            ) : (
                              <button
                                type="button"
                                data-unavailable-product
                                onClick={() => toast.error(`Produit indisponible : ${product.name}. Il ne peut pas être commandé pour le moment.`)}
                                className="h-8 rounded-xl border border-red-200 bg-red-50 px-2.5 text-xs font-semibold text-red-600"
                              >
                                Indisponible
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {tab === "my-orders" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Historique des Commandes</h2>
                  <p className="text-xs text-slate-500">Suivi des commandes, validation et état des versements</p>
                </div>
                <Button size="sm" variant="outline" onClick={loadData} className="h-8 text-xs">
                  <RefreshCw className="h-3 w-3 mr-1" /> Actualiser
                </Button>
              </div>

              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Rechercher par code, client, vendeur..."
                  value={ordersSearch}
                  onChange={(e) => setOrdersSearch(e.target.value)}
                  className="pl-9 h-10 bg-white rounded-xl border-slate-200 text-xs shadow-2xs"
                />
              </div>

              {filteredOrders.length === 0 ? (
                <EmptyState
                  icon={ShoppingBag}
                  title="Aucune commande trouvée"
                  subtitle="Vos commandes apparaîtront ici."
                />
              ) : (
                <div className="rounded-2xl bg-white border border-slate-200 overflow-hidden divide-y divide-slate-100 shadow-xs">
                  {filteredOrders.map((ord) => (
                    <div
                      key={ord.id}
                      onClick={() => has("orders.print") && setViewingOrder(ord)}
                      className="p-4 hover:bg-slate-50/80 transition-colors cursor-pointer space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-800">
                            {ord.code}
                          </span>
                          <StatusBadge status={ord.status} />
                          {ord.payment_method === "cash" ? (
                            ord.cash_deposit_status === "deposited" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3" /> Cash Versé Caisse
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                                <Clock className="w-3 h-3 text-amber-600" /> Cash (Versement Caisse En Attente)
                              </span>
                            )
                          ) : ord.payment_method === "credit" ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              Vente à Crédit
                            </span>
                          ) : ord.payment_method === "bank" ? (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                              Virement Bancaire
                            </span>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-slate-900 text-sm">
                            {ord.total_fc
                              ? `${ord.total_fc.toLocaleString("fr-FR")} FC`
                              : fmtMoney(ord.total, ord.currency || "USD")}
                          </div>
                          {ord.total_fc && (
                            <div className="text-[10px] text-slate-400 font-mono">
                              {fmtMoney(ord.total, "USD")}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                        <div className="truncate">
                          <span className="font-medium text-slate-800">{ord.client_name}</span>
                          {ord.marketer_name && (
                            <span className="text-slate-400"> • Vendeur : {ord.marketer_name}</span>
                          )}{" "}
                          • {fmtDate(ord.created_at)}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">{ord.items?.length || 0} art.</span>
                          {has("orders.print") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              setViewingOrder(ord);
                            }}
                            className="h-7 text-[11px] rounded-lg border-slate-200 text-slate-700 hover:text-[#0F3D68] hover:bg-slate-50 font-semibold px-2"
                          >
                            <FileText className="h-3 w-3 mr-1 text-[#0F3D68]" /> Voir la facture
                          </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Cart Drawer */}
      {cartDrawerOpen && (
        <Dialog open onOpenChange={() => setCartDrawerOpen(false)}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between text-base">
                <span className="flex items-center gap-2">
                  <ShoppingCart className="w-5 h-5 text-purple-700" />
                  Panier ({cartSummary.totalItemsCount})
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearCart}
                  className="h-8 text-xs text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Vider
                </Button>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-2xs">
                {cartSummary.lines.map(({ product, quantity, unit_price_fc, line_total_fc }) => (
                  <div key={product.id} className="p-3 flex items-center justify-between gap-3 bg-white">
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          referrerPolicy="no-referrer"
                          className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                          onError={(e) => {
                            (e.target as any).src = "https://images.unsplash.com/photo-1548839140-29a749e1bc4e?w=100&auto=format&fit=crop&q=60";
                          }}
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 text-slate-400">
                          <Store className="w-5 h-5 opacity-40" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 text-xs truncate">
                          {product.name}
                        </div>
                        <div className="font-bold text-xs text-purple-900 mt-0.5">
                          {line_total_fc.toLocaleString("fr-FR")} FC
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-100 rounded-xl p-1 shrink-0">
                      <button
                        onClick={() => updateCartQty(product.id, -1)}
                        className="h-6 w-6 rounded-lg bg-white shadow-xs flex items-center justify-center text-slate-700 hover:bg-slate-50"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-7 text-center text-xs font-bold">{quantity}</span>
                      <button
                        onClick={() => updateCartQty(product.id, 1)}
                        className="h-6 w-6 rounded-lg bg-purple-700 text-white flex items-center justify-center hover:bg-purple-800"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-slate-700">Client :</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setClientType("existing")}
                    className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
                      clientType === "existing"
                        ? "bg-[#0F3D68] text-white border-[#0F3D68]"
                        : "bg-white text-slate-700 border-slate-200"
                    }`}
                  >
                    Client Enregistré
                  </button>
                  <button
                    type="button"
                    onClick={() => setClientType("walkin")}
                    className={`py-2 px-3 rounded-xl text-xs font-medium border transition-colors ${
                      clientType === "walkin"
                        ? "bg-[#0F3D68] text-white border-[#0F3D68]"
                        : "bg-white text-slate-700 border-slate-200"
                    }`}
                  >
                    Comptoir / Nouveau
                  </button>
                </div>

                {clientType === "existing" ? (
                  <Select value={clientId} onValueChange={setClientId}>
                    <SelectTrigger className="h-10 rounded-xl bg-white">
                      <SelectValue placeholder="Choisir un client..." />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    placeholder="Nom du client *"
                    value={walkName}
                    onChange={(e) => setWalkName(e.target.value)}
                    className="h-10 rounded-xl bg-white text-xs"
                  />
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-800 flex items-center justify-between">
                  <span>Moyen de Paiement *</span>
                  <span className="text-[10px] text-slate-400 font-normal">Détermine le flux financier</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("cash")}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      paymentMethod === "cash"
                        ? "bg-amber-50/80 border-amber-500 ring-2 ring-amber-300 text-amber-950"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Cash</span>
                      <span className="text-[10px]">💵</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                      Reçu par le marketeur, versé à la caisse
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("credit")}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      paymentMethod === "credit"
                        ? "bg-blue-50/80 border-blue-500 ring-2 ring-blue-300 text-blue-950"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Crédit</span>
                      <span className="text-[10px]">📋</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                      Compte client & module Crédits
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod("bank")}
                    className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between ${
                      paymentMethod === "bank"
                        ? "bg-purple-50/80 border-purple-500 ring-2 ring-purple-300 text-purple-950"
                        : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center justify-between">
                      <span>Banque</span>
                      <span className="text-[10px]">🏦</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1 leading-tight">
                      Virement / chèque direct
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">Notes / Instructions (Optionnel)</Label>
                <Input
                  placeholder="Remarques éventuelles sur la livraison..."
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="mt-1 h-9 rounded-xl bg-white text-xs"
                />
              </div>

              <div className="rounded-2xl bg-purple-50/70 border border-purple-200 p-3 space-y-1 text-xs">
                <div className="flex justify-between text-purple-900 font-bold text-sm">
                  <span>Total à payer :</span>
                  <span>{cartSummary.totalCDF.toLocaleString("fr-FR")} FC</span>
                </div>
                <div className="flex justify-between text-slate-500 text-xs">
                  <span>Équivalent USD :</span>
                  <span>{fmtMoney(cartSummary.totalUSD, "USD")}</span>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setCartDrawerOpen(false)}>
                Continuer
              </Button>
              <Button
                onClick={handleSendOrder}
                disabled={submittingOrder}
                className="bg-purple-700 hover:bg-purple-800 text-white font-semibold"
              >
                {submittingOrder ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                Envoyer pour Approbation
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Invoice Modal */}
      <InvoiceModal
        isOpen={Boolean(viewingOrder)}
        order={viewingOrder}
        onClose={() => setViewingOrder(null)}
      />
    </div>
  );
}
