// Jeu de données démo complet pour l'aperçu (aucun effet sur l'application elle-même).
// Toutes les opérations passent par l'API réelle (mêmes règles métier qu'une saisie à la main),
// puis chaque journée simulée est datée au bon jour (≈ 2 mois d'activité sur le site unique de Goma).
type Api = (method: string, path: string, body?: any, token?: string, headers?: Record<string, string>) => Promise<{ status: number; data: any }>;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export async function fillDemo(api: Api, db: any) {
  const runStart = Date.now();
  let seed = 20261011;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
  const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
  const log: string[] = [];
  const must = async (method: string, path: string, body?: any, token?: string, headers?: Record<string, string>) => {
    const r = await api(method, path, body, token, headers);
    if (r.status >= 400) log.push(`${method} ${path} → ${r.status} ${r.data?.detail || ""}`);
    return r.data;
  };

  // Recale à la date du jour simulé tout horodatage produit pendant cette journée
  let mark = Date.now();
  const stampDay = (day: Date) => {
    const base = new Date(day);
    base.setHours(8, 0, 0, 0);
    const startOfDay = mark;
    const walk = (o: any, depth: number) => {
      if (!o || typeof o !== "object" || depth > 4) return;
      for (const k of Object.keys(o)) {
        const v = o[k];
        if (typeof v === "string" && ISO.test(v)) {
          const t = Date.parse(v);
          if (t >= runStart && t >= startOfDay - 5) {
            const off = Math.min(10 * 3600_000, Math.max(0, t - startOfDay) * 4000);
            o[k] = new Date(base.getTime() + off).toISOString();
          }
        } else if (v && typeof v === "object") walk(v, depth + 1);
      }
    };
    for (const key of Object.keys(db)) if (Array.isArray(db[key])) db[key].forEach((x: any) => walk(x, 0));
    mark = Date.now() + 1;
  };

  const login = async (email: string) => (await must("POST", "/auth/login", { email, password: "Admin@2026" }))?.access_token as string;
  const A = await login("admin@erp.local");

  /* ---------- Structure : sites, dépôts, produits, personnel ---------- */
  const setupDay = new Date();
  setupDay.setDate(setupDay.getDate() - 63);
  let sites = await must("GET", "/stock/sites", null, A);
  const goma = sites.find((s: any) => /goma/i.test(s.name)) || sites[0];
  await must("PUT", `/stock/sites/${goma.id}`, { location: "Goma, Nord-Kivu", description: "Siège et dépôt central" }, A);
  // Site unique : toute l'activité est rattachée au site de Goma (Nord-Kivu)
  const bkv = goma;
  let depots = await must("GET", "/stock/depots", null, A);
  const dCentral = depots.find((d: any) => d.site_id === goma.id);
  const dBirere = await must("POST", "/stock/depots", { name: "Dépôt Birere", code: "DBR", site_id: goma.id, location: "Quartier Birere, Goma", capacity: 12000 }, A);
  const dBukavu = await must("POST", "/stock/depots", { name: "Dépôt Ndosho", code: "DND", site_id: goma.id, location: "Quartier Ndosho, Goma", capacity: 20000 }, A);
  const dKadutu = await must("POST", "/stock/depots", { name: "Dépôt Katindo", code: "DKT", site_id: goma.id, location: "Quartier Katindo, Goma", capacity: 8000 }, A);

  // Catalogue : les 10 produits PREMIDIS du jeu de base (aucun produit ajouté)
  let products: any[] = await must("GET", "/products", null, A);

  const receive = async (depot: any, qtyFor: (p: any) => number, note: string) => {
    for (const p of products) {
      const q = qtyFor(p);
      if (q > 0) await must("POST", `/stock/depots/${depot.id}/adjust`, { product_id: p.id, quantity: q, reason: "reception", note }, A);
    }
  };
  await receive(dCentral, (p) => (/UNGA|LAVIE/.test(p.code) ? 600 : 400), "Arrivage initial");
  await receive(dBirere, (p) => (/UNGA|SIMBA/.test(p.code) ? 250 : 120), "Arrivage initial");
  await receive(dBukavu, (p) => (/UNGA|LAVIE/.test(p.code) ? 450 : 260), "Arrivage initial");
  await receive(dKadutu, (p) => (/UNGA|LAVIE/.test(p.code) ? 200 : 80), "Arrivage initial");

  const users = await must("GET", "/users", null, A);
  const patrick = users.find((u: any) => u.email === "marketer@erp.local");
  const sarah = users.find((u: any) => u.email === "sarah.kalala@erp.local");
  const jean = users.find((u: any) => u.email === "jean.kasongo@erp.local");
  await must("PUT", `/users/${patrick.id}`, { site_id: goma.id, warehouse_id: dCentral.id }, A);
  await must("PUT", `/users/${sarah.id}`, { site_id: goma.id, warehouse_id: dBirere.id }, A);
  await must("PUT", `/users/${jean.id}`, { site_id: bkv.id, warehouse_id: dBukavu.id }, A);
  const mkUser = (full_name: string, email: string, role_code: string, site_id: string, extra: any = {}) =>
    must("POST", "/users", { full_name, email, password: "Admin@2026", role_code, site_id, phone: `+243 99${int(1000000, 9999999)}`, is_active: true, ...extra }, A);
  await mkUser("Grace Mwamini", "caisse.goma@erp.local", "caissier", goma.id, { all_categories: true });
  await mkUser("Esther Bisimwa", "caisse2.goma@erp.local", "caissier", bkv.id, { all_categories: true });
  const josue = await mkUser("Josué Bahati", "josue.bahati@erp.local", "marketeur", bkv.id, { warehouse_id: dBukavu.id, categories: ["Farine", "Whisky Local", "Vin"], all_categories: false });
  const divine = await mkUser("Divine Furaha", "divine.furaha@erp.local", "marketeur", bkv.id, { warehouse_id: dKadutu.id, categories: ["Eau", "Whisky India"], all_categories: false });
  await mkUser("Pascal Mugisho", "chef2.goma@erp.local", "chef_dept", bkv.id, { all_categories: true });
  await mkUser("Aline Kahindo", "stock2.goma@erp.local", "gestionnaire_stock", bkv.id, { warehouse_id: dBukavu.id, all_categories: true });

  const T: Record<string, string> = {};
  for (const [k, e] of [["patrick", "marketer@erp.local"], ["sarah", "sarah.kalala@erp.local"], ["jean", "jean.kasongo@erp.local"], ["josue", "josue.bahati@erp.local"], ["divine", "divine.furaha@erp.local"], ["cg", "caisse.goma@erp.local"], ["cb", "caisse2.goma@erp.local"]] as const)
    T[k] = await login(e);

  // Clients (site unique : Goma)
  const clientDefs = [
    ["CLI-G101", "Alimentation Tumaini", "Grossiste", "Goma", "Patrick K.", 3000, "Boissons"],
    ["CLI-G102", "Boutique Neema", "Détaillant", "Goma", "Sarah Kalala", 800, "Boissons"],
    ["CLI-G103", "Supermarché Kivu Lac", "Grossiste", "Goma", "Patrick K.", 5000, "Farine"],
    ["CLI-G104", "Dépôt Maman Furaha", "Semi-grossiste", "Goma", "Sarah Kalala", 1500, "Eau"],
    ["CLI-G105", "Hôtel Ihusi (économat)", "Institutionnel", "Goma", "Patrick K.", 4000, "Boissons"],
    ["CLI-B201", "Ets Mudekereza", "Grossiste", "Goma", "Josué Bahati", 4500, "Farine"],
    ["CLI-B202", "Kiosque Bahati Katindo", "Détaillant", "Goma", "Divine Furaha", 600, "Boissons"],
    ["CLI-B203", "Restaurant Le Lac Kivu", "Institutionnel", "Goma", "Divine Furaha", 2000, "Boissons"],
    ["CLI-B204", "Alimentation Himbi", "Semi-grossiste", "Goma", "Josué Bahati", 2500, "Whisky Local"],
    ["CLI-B205", "Marché Virunga", "Détaillant", "Goma", "Jean Kasongo", 900, "Vin"],
  ];
  for (const [code, name, type, city, marketer_name, credit_limit, bu] of clientDefs)
    await must("POST", "/clients", { code, name, type, city, marketer_name, credit_limit, business_unit: bu, phone: `+243 97${int(1000000, 9999999)}`, address: `${city}, RDC`,
      // Fiche de connaissance du client (formulaire PREMIDIS) consultable par « Vérifier »
      document_url: `/assets/fiches/fiche_${code}.pdf`, document_name: `Fiche_de_connaissance_${code}.pdf`, document_type: "Fiche de connaissance du client", document_verified: true }, A);
  const clients: any[] = await must("GET", "/clients", null, A);
  const gomaClients = clients.filter((c) => !/Bukavu/i.test(c.city || ""));
  const bkvClients = clients.filter((c) => /Bukavu/i.test(c.city || ""));

  const v1 = await must("POST", "/delivery/vehicles", { plate: "CGO-4521-AB", driver_name: "Moïse Kambale", driver_phone: "+243 990 112 233", type: "Camion 10T", capacity: 800 }, A);
  const v2 = await must("POST", "/delivery/vehicles", { plate: "SKV-7788-BK", driver_name: "Eric Cirhuza", driver_phone: "+243 991 445 566", type: "Camionnette 3T", capacity: 300 }, A);
  for (const c of ["Carburant", "Salaires journaliers", "Loyer dépôt", "Électricité", "Fournitures de bureau", "Manutention", "Communication"]) await must("POST", "/cash/expense-categories", { name: c }, A);
  stampDay(setupDay);

  /* ---------- Activité quotidienne (≈ 2 mois) ---------- */
  // Une seule caisse (site unique) : tous les marketeurs versent à la caisse de Goma
  const team = [{ site: goma, cashier: "cg", marketers: ["patrick", "sarah", "josue", "divine", "jean"], clients }];
  const expenseReasons: Record<string, string[]> = {
    Carburant: ["Gasoil camion livraison", "Essence moto commerciale"],
    "Salaires journaliers": ["Paie journaliers dépôt", "Chargeurs du jour"],
    "Loyer dépôt": ["Loyer mensuel du dépôt"],
    Électricité: ["Facture SNEL", "Groupe électrogène"],
    "Fournitures de bureau": ["Carnets de bons, stylos", "Rames de papier"],
    Manutention: ["Déchargement camion fournisseur"],
    Communication: ["Unités téléphone commerciaux"],
  };
  const pendingDelivery: any[] = [];
  const days: Date[] = [];
  for (let k = 60; k >= 1; k--) {
    const d = new Date();
    d.setDate(d.getDate() - k);
    if (d.getDay() !== 0) days.push(d);
  }
  const today = new Date();

  const sell = async (t: any, mk: string, isToday: boolean) => {
    const client = pick(t.clients) as any;
    const n = int(1, 3);
    const items: any[] = [];
    for (let i = 0; i < n; i++) {
      const p = pick(products);
      if (items.some((x) => x.product_id === p.id)) continue;
      items.push({ product_id: p.id, quantity: /UNGA|LAVIE-20L/.test(p.code) ? int(2, 12) : int(6, 36) });
    }
    const credit = rnd() < 0.32;
    const order = await must("POST", "/orders", { client_id: client.id, items, payment_method: credit ? "credit" : "cash", source: rnd() < 0.5 ? "boutique" : undefined, delivery_address: client.address }, T[mk]);
    if (!order?.id) return;
    if (isToday && rnd() < 0.5) return; // reste « à approuver »
    if (rnd() < 0.05) {
      await must("POST", `/orders/${order.id}/reject`, { reason: pick(["Client injoignable", "Prix à renégocier", "Doublon de commande"]) }, A);
      return;
    }
    const ap = await api("POST", `/orders/${order.id}/approve`, { override_credit_limit: true }, A);
    if (ap.status >= 400) return;
    if (!credit) {
      const total = order.total;
      const usd = Math.floor(total * 0.7);
      await must("POST", "/cash/marketer-deposits/approve", {
        order_ids: [order.id],
        amount: total,
        billetUSD: {},
        billetCDF: {},
        billetage: { usd: {}, cdf: {}, total_usd: usd, total_cdf: Math.round((total - usd) * 2500), exchange_rate: 2500 },
        notes: `Versement ${order.code}`,
      }, T[t.cashier], { "x-cash-site": t.site.id });
    }
    pendingDelivery.push({ id: order.id, age: 0 });
  };

  const advanceDeliveries = async () => {
    for (const o of pendingDelivery) {
      o.age++;
      const target = o.age >= 3 ? 3 : o.age;
      while ((o.step || 0) < target) {
        o.step = (o.step || 0) + 1;
        await must("POST", `/delivery/orders/${o.id}/advance`, { vehicle_id: rnd() < 0.5 ? v1.id : v2.id }, A);
      }
    }
    for (let i = pendingDelivery.length - 1; i >= 0; i--) if ((pendingDelivery[i].step || 0) >= 3) pendingDelivery.splice(i, 1);
  };

  for (const [i, day] of [...days, today].entries()) {
    const isToday = day === today;
    for (const t of team) {
      const h = { "x-cash-site": t.site.id };
      await must("POST", "/cash/sessions/open", { initial_amount_usd: int(150, 400), initial_amount_cdf: int(2, 6) * 100000, exchange_rate: 2500 }, T[t.cashier], h);
      const nSales = int(1, 3) + (day.getDay() === 6 ? 1 : 0);
      for (let s = 0; s < nSales; s++) await sell(t, pick(t.marketers), isToday);
      if (rnd() < 0.55) {
        const cat = pick(Object.keys(expenseReasons));
        const cdf = rnd() < 0.4;
        await must("POST", "/cash/operations", {
          type: "out",
          category: cat,
          amount: cdf ? int(2, 30) * 5000 : int(5, 80),
          currency: cdf ? "CDF" : "USD",
          exchange_rate: 2500,
          beneficiary: pick(["Station Engen", "SNEL Goma", "Papeterie du Lac", "Équipe de chargement", "Vodacom"]),
          authorized_by: pick(["Super Administrateur", "Alice M.", "Pascal Mugisho"]),
          reason: pick(expenseReasons[cat]),
          reference: `DEC-${t.site.code || "S"}-${i}`,
        }, T[t.cashier], h);
      }
      // Règlements partiels de créances (avant la clôture, dans la caisse du site de la dette)
      if (i % 3 === 2) {
        const debts = (await must("GET", "/credits/debts", null, A)).filter((d: any) => (d.remaining || 0) > 5 && d.site_id === t.site.id);
        for (const d of debts.slice(0, int(1, 2))) {
          const pay = Math.round(Math.min(d.remaining, Math.max(5, d.remaining * (rnd() < 0.4 ? 1 : 0.4))) * 100) / 100;
          await must("POST", `/clients/${d.client_id}/payments`, { amount: pay, currency: "USD", credit_id: d.id, notes: `Règlement ${d.client_name}`, payment_method: "cash" }, T[t.cashier], h);
        }
      }
      if (!isToday) {
        const act = await must("GET", "/cash/active-session", null, T[t.cashier], h);
        const s = act?.session;
        if (s) {
          const gap = rnd() < 0.12 ? -int(1, 5) : 0;
          await must("POST", `/cash/sessions/${s.id}/close`, {
            actual_usd: Math.round((s.theoretical_balance_usd + gap) * 100) / 100,
            actual_cdf: s.theoretical_balance_cdf,
            theoretical_usd: s.theoretical_balance_usd,
            theoretical_cdf: s.theoretical_balance_cdf,
            discrepancy_reason: gap ? "Erreur de rendu monnaie constatée au comptage" : "",
            closing_billetage: { usd: {}, cdf: {}, total_usd: s.theoretical_balance_usd + gap, total_cdf: s.theoretical_balance_cdf, exchange_rate: 2500 },
          }, T[t.cashier], h);
        }
      }
    }
    await advanceDeliveries();
    // Mouvements de stock : réapprovisionnements, transferts, avaries, dons
    if (i % 10 === 5) {
      await receive(dCentral, (p) => (/UNGA|LAVIE/.test(p.code) ? 180 : 120), "Arrivage fournisseur");
      await receive(dBukavu, (p) => (/UNGA|LAVIE/.test(p.code) ? 150 : 90), "Arrivage fournisseur");
    }
    if (i % 12 === 7) {
      const p = pick(products);
      await must("POST", "/stock/transfers", { product_id: p.id, from_warehouse_id: dCentral.id, to_warehouse_id: dBukavu.id, quantity: int(20, 60), reason: "Réassort dépôt Ndosho" }, A);
      const p2 = pick(products);
      await must("POST", "/stock/transfers", { product_id: p2.id, from_warehouse_id: dBukavu.id, to_warehouse_id: dKadutu.id, quantity: int(10, 30), reason: "Réassort dépôt Katindo" }, A);
    }
    if (i % 9 === 4) {
      const p = pick(products);
      await must("POST", `/stock/depots/${pick([dCentral, dBukavu]).id}/adjust`, { product_id: p.id, quantity: -int(1, 6), reason: "damage", note: "Casse lors du déchargement" }, A);
    }
    if (i % 15 === 8) {
      const p = pick(products);
      await must("POST", `/stock/depots/${dBirere.id}/adjust`, { product_id: p.id, quantity: -int(1, 4), reason: "gift", note: "Échantillons client" }, A);
    }
    if (!isToday) stampDay(day);
  }

  /* ---------- Stock embarqué, objectifs, rapports ---------- */
  products = await must("GET", "/products", null, A);
  const byCode = (re: RegExp) => products.find((p) => re.test(p.code)) || products[0];
  for (const [mk, w, v, prods] of [
    [patrick, dCentral, v1, [byCode(/OC-RED/), byCode(/LAVIE-600/), byCode(/UNGA/)]],
    [josue, dBukavu, v2, [byCode(/UNGA/), byCode(/SIMBA/), byCode(/MENTOS/)]],
  ] as const)
    for (const p of prods) await must("POST", "/delivery/embarked/load", { marketer_id: mk.id, warehouse_id: w.id, vehicle_id: v.id, product_id: p.id, quantity: int(20, 60) }, A);

  const objectives = [
    { business_unit: "Farine", site: "Tous les sites", label: "Objectif mensuel Farine - 600 sacs", target_qty: 600, unit: "sacs", bonus_type: "money", bonus_amount: 60, bonus_unit: "USD", who: [patrick, josue], actual: 640, paid: true },
    { business_unit: "Whisky India", site: "Goma", label: "Whisky India Goma - 3 000 bouteilles", target_qty: 3000, unit: "bouteilles", bonus_type: "nature", bonus_qty: 3, bonus_unit: "cartons", product: byCode(/OC-RED/), who: [patrick, sarah], actual: 2140, paid: false },
    { business_unit: "Eau", site: "Goma", label: "Eau Goma - 2 500 bouteilles", target_qty: 2500, unit: "bouteilles", bonus_type: "money", bonus_amount: 40, bonus_unit: "USD", who: [divine, jean], actual: 2620, paid: false },
  ];
  for (const o of objectives) {
    const created = await must("POST", "/objectives", {
      business_unit: o.business_unit,
      site: o.site,
      label: o.label,
      target_qty: o.target_qty,
      target_amount: o.target_qty * 20,
      unit: o.unit,
      bonus_type: o.bonus_type,
      bonus_amount: (o as any).bonus_amount || 0,
      bonus_qty: (o as any).bonus_qty || 0,
      bonus_unit: o.bonus_unit,
      bonus_product_id: (o as any).product?.id,
      bonus_product_name: (o as any).product?.name,
      period_start: days[30]?.toISOString(),
      period_end: new Date(Date.now() + 86400000 * 20).toISOString(),
      beneficiaries: o.who.map((u: any) => ({
        user_id: u.id,
        user_name: u.full_name,
        role_code: u.role_code,
        bonus_type: o.bonus_type,
        bonus_amount: (o as any).bonus_amount || 0,
        bonus_qty: (o as any).bonus_qty || 0,
        bonus_unit: o.bonus_unit,
        bonus_product_id: (o as any).product?.id,
        bonus_product_name: (o as any).product?.name,
        status: "pending",
      })),
    }, A);
    const obj = db.objectives.find((x: any) => x.id === created?.id);
    if (obj) {
      obj.actual_qty = o.actual;
      obj.actual_amount = o.actual * 20;
      if (o.actual >= o.target_qty) obj.status = "reached";
    }
    if (o.paid && obj) for (const b of obj.beneficiaries) await must("POST", `/objectives/${obj.id}/claim-bonus`, { beneficiary_id: b.user_id, payment_method: "cash" }, A);
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 10);
  const monthEnd = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10);
  for (const s of [goma, bkv]) await must("POST", "/reports/stock-state/history", { site_id: s.id, from: monthStart, to: monthEnd }, A);
  await must("POST", "/reports/stock-state/history", { site_id: "all", from: monthStart, to: monthEnd }, A);
  await must("POST", "/accounting/sync", {}, A);

  if (log.length) console.warn("[démo] appels refusés", log.length, log);
  return log;
}
