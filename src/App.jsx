import { useState, useEffect, useMemo, useRef } from "react";
import QRCode from "qrcode";
import {
  ShoppingCart, Search, Plus, Trash2, Sparkles, LayoutGrid,
  BarChart3, Minus, X, PackagePlus, Wand2, Coins, ClipboardList, User2, CheckCircle2,
  Pencil, Check, LogOut, Lock, RefreshCw
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

// ---------- constants ----------

const ACCENT = { tint: "#C9A227", glow: "rgba(201,162,39,0.5)" };
const CONDITIONS = ["Mint", "Near Mint", "Excellent", "Použitá"];
const EMPTY_BUYER = { name: "", phone: "", email: "", address: "", note: "" };

const CZK = (n) => Number(n).toLocaleString("cs-CZ") + " Kč";
const SHOP_EMAIL = "pbartonvozice@seznam.cz";
// TODO: doplň skutečné údaje prodejce — zobrazují se v Obchodních podmínkách a GDPR
const SELLER = {
  name: "[Tvé jméno a příjmení]",
  address: "[Ulice, číslo, město, PSČ]",
  ico: "[IČO — pokud máš]",
  email: SHOP_EMAIL,
  note: "Prodej jako soukromá osoba (bez IČO) — nejde o podnikatelskou činnost.",
};

// ---------- local storage (jen košík, údaje kupujícího a vlastní objednávky v tomto zařízení) ----------

async function loadKey(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw !== null ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
async function saveKey(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best effort, e.g. storage full or disabled */
  }
}

// ---------- komunikace se serverem ----------

const getAdminPw = () => { try { return sessionStorage.getItem("fc-admin") || ""; } catch { return ""; } };
const setAdminPw = (pw) => { try { sessionStorage.setItem("fc-admin", pw); } catch { /* ignore */ } };
const clearAdminPw = () => { try { sessionStorage.removeItem("fc-admin"); } catch { /* ignore */ } };

async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (/^\/api\/(cards|orders|login)/.test(path)) {
    const pw = getAdminPw();
    if (pw) headers["x-admin-password"] = pw;
  }
  const r = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  let data = null;
  try { data = await r.json(); } catch { /* ne-JSON odpověď */ }
  if (!r.ok) {
    const e = new Error(data?.message || `Chyba serveru (${r.status})`);
    e.status = r.status;
    e.code = data?.error;
    throw e;
  }
  return data;
}

// ---------- card face ----------

function CardFace({ card, size = "normal" }) {
  const r = ACCENT;
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  function onMove(e) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -10, y: px * 12 });
  }
  function onLeave() { setTilt({ x: 0, y: 0 }); }

  const h = size === "small" ? 180 : 240;
  const imgSrc = card.image || (card.hasImage ? `/api/image?id=${card.id}` : null);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{
        height: h,
        borderRadius: 14,
        position: "relative",
        overflow: "hidden",
        background: `linear-gradient(155deg, #1B1E2A 0%, #12141C 60%)`,
        border: `1px solid ${r.tint}55`,
        boxShadow: `0 12px 30px -12px ${r.glow}`,
        transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: "transform 120ms ease-out",
      }}
    >
      <div
        className="foil-sweep"
        style={{
          position: "absolute", inset: 0,
          background: `linear-gradient(115deg, transparent 30%, ${r.tint}33 45%, ${r.tint}88 50%, ${r.tint}33 55%, transparent 70%)`,
          backgroundSize: "250% 250%",
        }}
      />
      <div style={{ position: "absolute", top: 10, right: 10 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#8B92A6" }}>
          {card.condition}
        </span>
      </div>
      {imgSrc ? (
        <>
          <img
            src={imgSrc}
            alt={card.name}
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(180deg, rgba(18,20,28,0) 45%, rgba(18,20,28,0.92) 100%)",
          }} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            width: h * 0.4, height: h * 0.4, borderRadius: "50%",
            border: `2px solid ${r.tint}`, display: "flex", alignItems: "center", justifyContent: "center",
            filter: `drop-shadow(0 0 14px ${r.glow})`,
          }}>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: h * 0.16, fontWeight: 700, color: r.tint, opacity: 0.9 }}>
              {(card.name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}
            </span>
          </div>
        </div>
      )}
      <div style={{ position: "absolute", left: 12, right: 12, bottom: 10 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, color: "#EDEAE0", lineHeight: 1.15 }}>
          {card.name}
        </div>
        {card.description && (
          <div style={{ fontSize: 10.5, color: "#8B92A6", marginTop: 3, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {card.description}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- main app ----------

export default function FootyCardsApp() {
  const [cards, setCards] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [admin, setAdmin] = useState(false);
  const [cart, setCart] = useState({});
  const [myOrders, setMyOrders] = useState([]);
  const [buyer, setBuyer] = useState(EMPTY_BUYER);
  const [view, setView] = useState("catalog");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [toast, setToast] = useState(null);
  const [localReady, setLocalReady] = useState(false);

  async function refreshCards() {
    try {
      const data = await api("/api/cards");
      setCards(data.cards);
      setAdmin(!!data.admin);
      setLoadError("");
      if (!data.admin) clearAdminPw();
    } catch (e) {
      setLoadError(e.message || "Nepodařilo se načíst nabídku.");
      setCards((c) => c ?? []);
    }
  }

  useEffect(() => {
    (async () => {
      setCart(await loadKey("footycards-cart", {}));
      setBuyer(await loadKey("footycards-buyer", EMPTY_BUYER));
      setMyOrders(await loadKey("footycards-myorders", []));
      setLocalReady(true);
    })();
    refreshCards();
  }, []);

  useEffect(() => { if (localReady) saveKey("footycards-cart", cart); }, [cart, localReady]);
  useEffect(() => { if (localReady) saveKey("footycards-buyer", buyer); }, [buyer, localReady]);
  useEffect(() => { if (localReady) saveKey("footycards-myorders", myOrders); }, [myOrders, localReady]);

  // košík: zahodit karty, které už nejsou, a srovnat počty podle skladu
  useEffect(() => {
    if (!cards || !localReady || loadError) return;
    setCart((prev) => {
      const next = {};
      let changed = false;
      for (const [id, q] of Object.entries(prev)) {
        const c = cards.find((x) => x.id === id);
        if (!c || c.qty <= 0) { changed = true; continue; }
        const n = Math.min(q, c.qty);
        if (n !== q) changed = true;
        next[id] = n;
      }
      return changed ? next : prev;
    });
  }, [cards, localReady, loadError]);

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }

  const filtered = useMemo(() => {
    let list = cards || [];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q));
    }
    return [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, "cs");
      if (sortBy === "price-asc") return a.price - b.price;
      if (sortBy === "price-desc") return b.price - a.price;
      return 0;
    });
  }, [cards, search, sortBy]);

  function addToCart(card) {
    const inCart = cart[card.id] || 0;
    if (inCart >= card.qty) { showToast("Víc kusů není skladem"); return; }
    setCart({ ...cart, [card.id]: inCart + 1 });
    showToast(`${card.name} přidána do košíku`);
  }
  function changeCartQty(id, delta) {
    setCart((prev) => {
      const next = { ...prev };
      const card = (cards || []).find((c) => c.id === id);
      const nv = (next[id] || 0) + delta;
      if (nv <= 0) delete next[id];
      else next[id] = Math.min(nv, card ? card.qty : nv);
      return next;
    });
  }
  function removeFromCart(id) {
    setCart((prev) => { const n = { ...prev }; delete n[id]; return n; });
  }

  const cartItems = useMemo(
    () => Object.entries(cart)
      .map(([id, qty]) => ({ card: (cards || []).find((c) => c.id === id), qty }))
      .filter((x) => x.card),
    [cart, cards]
  );
  const cartTotal = cartItems.reduce((s, x) => s + x.card.price * x.qty, 0);
  const cartCount = cartItems.reduce((s, x) => s + x.qty, 0);

  async function placeOrder(buyerInfo) {
    if (cartItems.length === 0) return { ok: false, message: "Košík je prázdný." };
    try {
      const data = await api("/api/order", {
        method: "POST",
        body: { items: cartItems.map(({ card, qty }) => ({ id: card.id, qty })), buyer: buyerInfo, consent: true },
      });
      setMyOrders((prev) => [data.order, ...prev]);
      setCart({});
      setBuyer(buyerInfo);
      await refreshCards();
      showToast("Objednávka odeslána — níže najdeš platbu QR kódem");
      setView("orders");
      return { ok: true };
    } catch (e) {
      if (e.status === 409) await refreshCards();
      return { ok: false, message: e.message };
    }
  }

  // ----- správa (jen po přihlášení) -----
  async function adminAction(fn, okMsg) {
    try {
      await fn();
      await refreshCards();
      if (okMsg) showToast(okMsg);
      return { ok: true };
    } catch (e) {
      if (e.status === 401) { clearAdminPw(); setAdmin(false); }
      return { ok: false, message: e.message };
    }
  }
  async function addCard(card) {
    const r = await adminAction(() => api("/api/cards", { method: "POST", body: card }), "Karta přidána do nabídky");
    if (r.ok) setView("catalog");
    return r;
  }
  const updateCard = (id, patch) => adminAction(() => api("/api/cards", { method: "PATCH", body: { id, ...patch } }), "Uloženo");
  const deleteCard = (id) => adminAction(() => api(`/api/cards?id=${id}`, { method: "DELETE" }), "Karta smazána");

  async function login(pw) {
    setAdminPw(pw);
    try {
      await api("/api/login", { method: "POST" });
      await refreshCards();
      setView("catalog");
      showToast("Přihlášen jako správce");
      return { ok: true };
    } catch (e) {
      clearAdminPw();
      return { ok: false, message: e.message };
    }
  }
  function logout() {
    clearAdminPw();
    setAdmin(false);
    refreshCards();
    setView("catalog");
  }

  const totalValue = useMemo(() => (cards || []).reduce((s, c) => s + c.price * c.qty, 0), [cards]);
  const totalCards = useMemo(() => (cards || []).reduce((s, c) => s + c.qty, 0), [cards]);
  const topCards = useMemo(() => [...(cards || [])].sort((a, b) => b.price - a.price).slice(0, 5), [cards]);

  if (cards === null) {
    return (
      <div style={{ minHeight: "100vh", background: "#12141C", display: "flex", alignItems: "center", justifyContent: "center", color: "#8B92A6", fontFamily: "'JetBrains Mono', monospace" }}>
        Načítám nabídku…
      </div>
    );
  }

  const ADMIN_VIEWS = ["sell", "adminorders", "dashboard"];
  const current = !admin && ADMIN_VIEWS.includes(view) ? "catalog" : view;
  const tabs = admin
    ? [
        { id: "catalog", label: "Katalog", icon: LayoutGrid },
        { id: "sell", label: "Přidat kartu", icon: PackagePlus },
        { id: "adminorders", label: "Objednávky", icon: ClipboardList },
        { id: "dashboard", label: "Hodnota sbírky", icon: BarChart3 },
      ]
    : [
        { id: "catalog", label: "Katalog", icon: LayoutGrid },
        { id: "orders", label: "Moje objednávky", icon: ClipboardList },
      ];

  return (
    <div style={{ minHeight: "100vh", background: "#12141C", color: "#EDEAE0", fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        * { box-sizing: border-box; }
        .foil-sweep { animation: sweep 5s ease-in-out infinite; }
        @keyframes sweep {
          0% { background-position: 0% 0%; }
          50% { background-position: 100% 100%; }
          100% { background-position: 0% 0%; }
        }
        .navbtn { transition: color 150ms, background 150ms; cursor: pointer; }
        .navbtn:hover { color: #EDEAE0 !important; }
        .card-btn:hover { transform: translateY(-2px); }
        select, input, textarea { outline: none; }
        ::selection { background: #C9A22755; }
        @media (prefers-reduced-motion: reduce) {
          .foil-sweep { animation: none; }
        }
      `}</style>

      {/* header */}
      <header style={{ borderBottom: "1px solid #23263380", position: "sticky", top: 0, background: "#12141Cee", backdropFilter: "blur(8px)", zIndex: 10 }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22, color: "#C9A227" }}>⚽</span>
            <span style={{ fontFamily: "'Fraunces', serif", fontWeight: 700, fontSize: 21, letterSpacing: 0.3 }}>
              FootyCards<span style={{ color: "#C9A227" }}>cz</span>
            </span>
            {admin && (
              <span style={{ fontSize: 10.5, color: "#12141C", background: "#C9A227", borderRadius: 999, padding: "2px 8px", fontWeight: 700 }}>SPRÁVCE</span>
            )}
          </div>
          <nav style={{ display: "flex", gap: 4, background: "#1B1E2A", borderRadius: 22, padding: 4, flexWrap: "wrap", justifyContent: "center" }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                className="navbtn"
                onClick={() => setView(t.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "8px 14px", borderRadius: 999, border: "none",
                  background: current === t.id ? "#12141C" : "transparent",
                  color: current === t.id ? "#C9A227" : "#8B92A6",
                  fontSize: 13, fontWeight: 500, fontFamily: "'Inter', sans-serif",
                }}
              >
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </nav>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {admin && (
              <button onClick={logout} className="navbtn" title="Odhlásit správce"
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 12px", borderRadius: 10, border: "1px solid #2A2E3D", background: "transparent", color: "#8B92A6", fontSize: 12.5 }}>
                <LogOut size={14} /> Odhlásit
              </button>
            )}
            <button
              onClick={() => setView("cart")}
              className="navbtn"
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "9px 16px",
                borderRadius: 10, border: "1px solid #C9A22755",
                background: current === "cart" ? "#C9A22722" : "transparent",
                color: "#EDEAE0", fontSize: 13, fontWeight: 500,
              }}
            >
              <ShoppingCart size={15} color="#C9A227" />
              Košík {cartCount > 0 && <span style={{ background: "#C9A227", color: "#12141C", borderRadius: 999, fontSize: 11, padding: "1px 7px", fontWeight: 700 }}>{cartCount}</span>}
            </button>
          </div>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 24px 80px" }}>
        {current === "catalog" && (
          <CatalogView
            cards={filtered}
            admin={admin}
            loadError={loadError}
            onRetry={refreshCards}
            search={search} setSearch={setSearch}
            sortBy={sortBy} setSortBy={setSortBy}
            addToCart={addToCart}
            onUpdate={updateCard}
            onDelete={deleteCard}
          />
        )}
        {current === "cart" && (
          <CartView items={cartItems} total={cartTotal} onQty={changeCartQty} onRemove={removeFromCart} onPlaceOrder={placeOrder} onBack={() => setView("catalog")} initialBuyer={buyer} onNavigate={setView} />
        )}
        {current === "sell" && <SellView onAdd={addCard} />}
        {current === "orders" && <OrdersView orders={myOrders} />}
        {current === "adminorders" && (
          <AdminOrdersView
            showToast={showToast}
            refreshCards={refreshCards}
            onUnauthorized={() => { clearAdminPw(); setAdmin(false); }}
          />
        )}
        {current === "login" && <LoginView admin={admin} onLogin={login} onLogout={logout} />}
        {current === "terms" && <TermsView />}
        {current === "privacy" && <PrivacyView />}
        {current === "complaints" && <ComplaintsView />}
        {current === "dashboard" && (
          <DashboardView totalValue={totalValue} totalCards={totalCards} topCards={topCards} />
        )}
      </main>

      <footer style={{ borderTop: "1px solid #23263380", padding: "20px 24px 40px" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "center" }}>
          {[
            { id: "terms", label: "Obchodní podmínky" },
            { id: "privacy", label: "Ochrana osobních údajů" },
            { id: "complaints", label: "Reklamační řád" },
          ].map((l) => (
            <button
              key={l.id}
              onClick={() => setView(l.id)}
              style={{ background: "none", border: "none", color: "#8B92A6", fontSize: 12.5, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
            >
              {l.label}
            </button>
          ))}
          <button
            onClick={() => setView("login")}
            style={{ background: "none", border: "none", color: "#4b5163", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}
          >
            <Lock size={11} /> Správce
          </button>
        </div>
      </footer>

      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          background: "#1B1E2A", border: "1px solid #C9A22755", color: "#EDEAE0",
          padding: "10px 20px", borderRadius: 10, fontSize: 13, boxShadow: "0 10px 30px -8px rgba(0,0,0,0.6)",
          display: "flex", alignItems: "center", gap: 8, zIndex: 50,
        }}>
          <Sparkles size={14} color="#C9A227" /> {toast}
        </div>
      )}
    </div>
  );
}

// ---------- catalog ----------

function AdminCardControls({ card, onUpdate, onDelete }) {
  const [mode, setMode] = useState("idle"); // idle | edit | confirm
  const [price, setPrice] = useState(String(card.price));
  const [qty, setQty] = useState(String(card.qty));
  const [msg, setMsg] = useState("");
  const inp = { width: 70, background: "#12141C", color: "#EDEAE0", border: "1px solid #2A2E3D", borderRadius: 6, padding: "5px 7px", fontSize: 12.5 };
  const btn = { height: 30, borderRadius: 8, border: "1px solid #2A2E3D", background: "transparent", color: "#8B92A6", cursor: "pointer", padding: "0 10px", fontSize: 12, display: "inline-flex", alignItems: "center", gap: 5 };

  async function save() {
    const r = await onUpdate(card.id, { price: Number(price), qty: Number(qty) });
    if (r.ok) { setMode("idle"); setMsg(""); } else setMsg(r.message);
  }
  async function remove() {
    const r = await onDelete(card.id);
    if (!r.ok) { setMsg(r.message); setMode("idle"); }
  }

  if (mode === "edit") {
    return (
      <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <input aria-label="Cena" style={inp} type="number" min="1" value={price} onChange={(e) => setPrice(e.target.value)} />
        <span style={{ fontSize: 11, color: "#8B92A6" }}>Kč</span>
        <input aria-label="Počet kusů" style={{ ...inp, width: 56 }} type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
        <span style={{ fontSize: 11, color: "#8B92A6" }}>ks</span>
        <button style={{ ...btn, background: "#C9A227", color: "#12141C", border: "none" }} onClick={save}><Check size={13} /> Uložit</button>
        <button style={btn} onClick={() => setMode("idle")}>Zrušit</button>
        {msg && <div style={{ width: "100%", fontSize: 11.5, color: "#B3423E" }}>{msg}</div>}
      </div>
    );
  }
  if (mode === "confirm") {
    return (
      <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 12, color: "#B3423E" }}>Smazat kartu?</span>
        <button style={{ ...btn, background: "#B3423E", color: "#fff", border: "none" }} onClick={remove}>Ano, smazat</button>
        <button style={btn} onClick={() => setMode("idle")}>Ne</button>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <button style={btn} onClick={() => setMode("edit")}><Pencil size={12} /> Upravit</button>
      <button style={btn} onClick={() => setMode("confirm")} title="Odebrat z nabídky"><Trash2 size={12} /> Smazat</button>
      {msg && <div style={{ width: "100%", fontSize: 11.5, color: "#B3423E" }}>{msg}</div>}
    </div>
  );
}

function CatalogView({ cards, admin, loadError, onRetry, search, setSearch, sortBy, setSortBy, addToCart, onUpdate, onDelete }) {
  const selectStyle = {
    background: "#1B1E2A", color: "#EDEAE0", border: "1px solid #2A2E3D",
    borderRadius: 8, padding: "8px 10px", fontSize: 13, fontFamily: "'Inter', sans-serif",
  };
  return (
    <div>
      <div style={{ marginBottom: 22 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 30, fontWeight: 600, margin: 0 }}>Nabídka karet</h1>
        {!loadError && <p style={{ color: "#8B92A6", fontSize: 14, margin: "6px 0 0" }}>{cards.length} karet odpovídá filtru</p>}
      </div>

      {loadError && (
        <div role="alert" style={{ background: "#B3423E1A", border: "1px solid #B3423E66", borderRadius: 12, padding: 16, marginBottom: 22, fontSize: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Obchod je teď nedostupný</div>
          <div style={{ color: "#C7CBD6", fontSize: 13, marginBottom: 10 }}>Zkus to prosím za chvíli. <span style={{ color: "#8B92A6" }}>({loadError})</span></div>
          <button onClick={onRetry} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #2A2E3D", color: "#EDEAE0", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, cursor: "pointer" }}>
            <RefreshCw size={13} /> Zkusit znovu
          </button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
        <div style={{ position: "relative", flex: "1 1 220px" }}>
          <Search size={15} color="#8B92A6" style={{ position: "absolute", left: 12, top: 11 }} />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat kartu podle názvu nebo popisu…"
            style={{ ...selectStyle, width: "100%", paddingLeft: 34 }}
          />
        </div>
        <select style={selectStyle} value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Řadit: dle názvu</option>
          <option value="price-asc">Cena vzestupně</option>
          <option value="price-desc">Cena sestupně</option>
        </select>
      </div>

      {!loadError && cards.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#8B92A6" }}>
          {admin ? "Zatím tu nejsou žádné karty. Přidej první v záložce „Přidat kartu“." : "Právě teď nejsou v nabídce žádné karty. Zkus to později."}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 18 }}>
          {cards.map((card) => (
            <div key={card.id} className="card-btn" style={{ transition: "transform 150ms", opacity: card.qty <= 0 ? 0.55 : 1 }}>
              <CardFace card={card} />
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 500, color: "#C9A227" }}>
                    {CZK(card.price)}
                  </div>
                  <div style={{ fontSize: 11, color: "#8B92A6" }}>{card.qty > 0 ? `skladem ${card.qty}×` : "vyprodáno"}</div>
                </div>
                <button
                  onClick={() => addToCart(card)}
                  disabled={card.qty <= 0}
                  aria-label={`Přidat do košíku: ${card.name}`}
                  style={{ width: 32, height: 32, borderRadius: 8, border: "none", background: card.qty > 0 ? "#C9A227" : "#2A2E3D", color: "#12141C", cursor: card.qty > 0 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <Plus size={15} />
                </button>
              </div>
              {admin && <AdminCardControls card={card} onUpdate={onUpdate} onDelete={onDelete} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- cart ----------

function CartView({ items, total, onQty, onRemove, onPlaceOrder, onBack, initialBuyer, onNavigate }) {
  const [buyer, setBuyer] = useState(initialBuyer || { name: "", phone: "", email: "", address: "", note: "" });
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canOrder = items.length > 0 && buyer.name.trim().length > 0 && buyer.phone.trim().length > 0 && agreed;

  async function submit() {
    if (!canOrder || busy) return;
    setBusy(true);
    setError("");
    const r = await onPlaceOrder(buyer);
    setBusy(false);
    if (!r.ok) setError(r.message);
  }

  const inputStyle = {
    width: "100%", background: "#12141C", color: "#EDEAE0", border: "1px solid #2A2E3D",
    borderRadius: 8, padding: "9px 11px", fontSize: 13, fontFamily: "'Inter', sans-serif",
  };
  const label = { fontSize: 11.5, color: "#8B92A6", marginBottom: 5, display: "block" };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginBottom: 22 }}>Košík</h1>
      {error && (
        <div role="alert" style={{ background: "#B3423E1A", border: "1px solid #B3423E66", borderRadius: 10, padding: "10px 14px", marginBottom: 18, fontSize: 13, color: "#F0A9A5" }}>
          {error}
        </div>
      )}
      {items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: "#8B92A6" }}>
          Košík je prázdný.
          <div style={{ marginTop: 14 }}>
            <button onClick={onBack} style={{ background: "#1B1E2A", color: "#EDEAE0", border: "1px solid #2A2E3D", padding: "9px 18px", borderRadius: 8, cursor: "pointer" }}>
              Zpět do katalogu
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
            {items.map(({ card, qty }) => (
              <div key={card.id} style={{ display: "flex", gap: 14, alignItems: "center", background: "#1B1E2A", border: "1px solid #23263380", borderRadius: 12, padding: 12 }}>
                <div style={{ width: 60, flexShrink: 0 }}><CardFace card={card} size="small" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{card.name}</div>
                  <div style={{ fontSize: 12, color: "#8B92A6" }}>{card.condition} · {CZK(card.price)} / ks</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <button onClick={() => onQty(card.id, -1)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #2A2E3D", background: "transparent", color: "#EDEAE0", cursor: "pointer" }}><Minus size={12} style={{ margin: "auto" }} /></button>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, width: 18, textAlign: "center" }}>{qty}</span>
                  <button onClick={() => onQty(card.id, 1)} style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #2A2E3D", background: "transparent", color: "#EDEAE0", cursor: "pointer" }}><Plus size={12} style={{ margin: "auto" }} /></button>
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, width: 90, textAlign: "right", color: "#C9A227" }}>
                  {CZK(card.price * qty)}
                </div>
                <button onClick={() => onRemove(card.id)} style={{ background: "transparent", border: "none", color: "#8B92A6", cursor: "pointer" }}><X size={16} /></button>
              </div>
            ))}
          </div>

          <div style={{ background: "#1B1E2A", border: "1px solid #23263380", borderRadius: 12, padding: 16, marginBottom: 20 }}>
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, margin: "0 0 14px", display: "flex", alignItems: "center", gap: 8 }}>
              <User2 size={15} color="#C9A227" /> Údaje kupujícího
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={label}>Jméno a příjmení *</label>
                <input style={inputStyle} value={buyer.name} onChange={(e) => setBuyer({ ...buyer, name: e.target.value })} placeholder="Jan Novák" />
              </div>
              <div>
                <label style={label}>Telefon *</label>
                <input style={inputStyle} value={buyer.phone} onChange={(e) => setBuyer({ ...buyer, phone: e.target.value })} placeholder="+420 601 234 567" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={label}>E-mail</label>
                <input style={inputStyle} value={buyer.email} onChange={(e) => setBuyer({ ...buyer, email: e.target.value })} placeholder="jan@email.cz" />
              </div>
              <div>
                <label style={label}>Adresa pro zaslání</label>
                <input style={inputStyle} value={buyer.address} onChange={(e) => setBuyer({ ...buyer, address: e.target.value })} placeholder="Ulice 12, Praha" />
              </div>
            </div>
            <div>
              <label style={label}>Poznámka</label>
              <input style={inputStyle} value={buyer.note} onChange={(e) => setBuyer({ ...buyer, note: e.target.value })} placeholder="např. preferovaný způsob platby" />
            </div>
            <div style={{ fontSize: 11, color: "#8B92A6", marginTop: 8 }}>* povinné údaje</div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #23263380", paddingTop: 18 }}>
            <span style={{ color: "#8B92A6", fontSize: 14 }}>Celkem</span>
            <span style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 600, color: "#C9A227" }}>{CZK(total)}</span>
          </div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 18 }}>
            <input
              type="checkbox"
              id="agree"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              style={{ marginTop: 3, width: 16, height: 16, accentColor: "#C9A227", flexShrink: 0 }}
            />
            <label htmlFor="agree" style={{ fontSize: 12.5, color: "#C7CBD6", lineHeight: 1.5 }}>
              Souhlasím s{" "}
              <button type="button" onClick={() => onNavigate("terms")} style={{ background: "none", border: "none", padding: 0, color: "#C9A227", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" }}>obchodními podmínkami</button>
              {" "}a{" "}
              <button type="button" onClick={() => onNavigate("privacy")} style={{ background: "none", border: "none", padding: 0, color: "#C9A227", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" }}>zpracováním osobních údajů</button>.
            </label>
          </div>
          <button
            onClick={submit}
            disabled={!canOrder || busy}
            style={{
              marginTop: 12, width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: canOrder ? "#C9A227" : "#2A2E3D",
              color: canOrder ? "#12141C" : "#6b7280",
              fontWeight: 600, fontSize: 14, cursor: canOrder ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Odesílám…" : "Odeslat objednávku"}
          </button>
          {!canOrder && (
            <div style={{ fontSize: 12, color: "#8B92A6", marginTop: 8, textAlign: "center" }}>
              {!agreed ? "Potvrď prosím souhlas s podmínkami." : "Vyplň prosím jméno a telefon."}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------- orders ----------

function PaymentBox({ payment }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(payment.spd, { width: 240, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => {});
    return () => { alive = false; };
  }, [payment.spd]);

  const row = { display: "flex", justifyContent: "space-between", gap: 12, fontSize: 12.5, padding: "3px 0" };
  const mono = { fontFamily: "'JetBrains Mono', monospace", color: "#EDEAE0" };
  return (
    <div style={{ background: "#12141C", border: "1px solid #C9A22744", borderRadius: 10, padding: 14, marginBottom: 14 }}>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 14, fontWeight: 600, color: "#C9A227", marginBottom: 10 }}>
        Zaplatit QR kódem
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ background: "#fff", padding: 8, borderRadius: 8, width: 164, height: 164, flexShrink: 0 }}>
          {qr && <img src={qr} alt="QR platba" style={{ width: "100%", height: "100%" }} />}
        </div>
        <div style={{ flex: "1 1 200px", minWidth: 0 }}>
          <div style={row}><span style={{ color: "#8B92A6" }}>Částka</span><span style={mono}>{CZK(payment.amount)}</span></div>
          <div style={row}><span style={{ color: "#8B92A6" }}>Účet</span><span style={mono}>{payment.account}</span></div>
          <div style={row}><span style={{ color: "#8B92A6" }}>Var. symbol</span><span style={mono}>{payment.vs}</span></div>
          <div style={{ fontSize: 11, color: "#8B92A6", marginTop: 8, lineHeight: 1.5 }}>
            V bankovní aplikaci zvol „Platba QR kódem" a naskenuj kód. Na mobilu otevři bankovní aplikaci, kód ulož jako snímek obrazovky a načti ho z galerie.
          </div>
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order: o, admin = false, onCancel }) {
  const [confirm, setConfirm] = useState(false);
  const btn = { borderRadius: 8, border: "1px solid #2A2E3D", background: "transparent", color: "#8B92A6", cursor: "pointer", padding: "7px 12px", fontSize: 12.5 };
  const badge = (ok, label) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, color: ok ? "#4FD1C5" : "#8B92A6", background: ok ? "#4FD1C51A" : "#8B92A61A", border: `1px solid ${ok ? "#4FD1C555" : "#8B92A655"}`, borderRadius: 999, padding: "3px 10px" }}>
      {ok && <CheckCircle2 size={12} />} {label}
    </span>
  );
  return (
    <div style={{ background: "#1B1E2A", border: "1px solid #23263380", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "#8B92A6" }}>
          #{o.id} · {new Date(o.date).toLocaleString("cs-CZ")}
        </span>
        <span style={{ fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 600, color: "#C9A227" }}>{CZK(o.total)}</span>
      </div>
      {admin && o.notify && (
        <div style={{ marginBottom: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
          {badge(o.notify.telegram, o.notify.telegram ? "Telegram odeslán" : "Telegram neodeslán")}
          {badge(o.notify.email, o.notify.email ? "E-mail odeslán" : "E-mail neodeslán")}
        </div>
      )}
      {o.buyer && (
        <div style={{ fontSize: 12.5, color: "#EDEAE0", background: "#12141C", border: "1px solid #23263380", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
          <div style={{ fontWeight: 600 }}>{o.buyer.name}</div>
          <div style={{ color: "#8B92A6" }}>
            {admin ? <a href={`tel:${o.buyer.phone}`} style={{ color: "#C9A227" }}>{o.buyer.phone}</a> : o.buyer.phone}
            {o.buyer.email ? ` · ${o.buyer.email}` : ""}
          </div>
          {o.buyer.address && <div style={{ color: "#8B92A6" }}>{o.buyer.address}</div>}
          {o.buyer.note && <div style={{ color: "#8B92A6", fontStyle: "italic" }}>{o.buyer.note}</div>}
        </div>
      )}
      <div style={{ display: "grid", gap: 4, marginBottom: 14 }}>
        {o.items.map((i, idx) => (
          <div key={idx} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#EDEAE0" }}>
            <span>{i.qty}× {i.name}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#8B92A6" }}>{CZK(i.price * i.qty)}</span>
          </div>
        ))}
      </div>
      {o.payment && !admin && <PaymentBox payment={o.payment} />}
      {admin && o.payment && (
        <div style={{ fontSize: 12, color: "#8B92A6", marginBottom: 12 }}>Variabilní symbol platby: <span style={{ fontFamily: "'JetBrains Mono', monospace", color: "#EDEAE0" }}>{o.payment.vs}</span></div>
      )}
      {!o.payment && !admin && (
        <div style={{ fontSize: 12.5, color: "#8B92A6" }}>Platbu a doručení s tebou prodejce domluví na uvedeném telefonu.</div>
      )}
      {admin && (
        confirm ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, color: "#E26D68" }}>Opravdu zrušit a vrátit karty na sklad?</span>
            <button style={{ ...btn, background: "#B3423E", color: "#fff", border: "none" }} onClick={() => onCancel(o.id)}>Ano, zrušit</button>
            <button style={btn} onClick={() => setConfirm(false)}>Ne</button>
          </div>
        ) : (
          <button style={btn} onClick={() => setConfirm(true)}>Zrušit objednávku (vrátit na sklad)</button>
        )
      )}
    </div>
  );
}

function OrdersView({ orders }) {
  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
        <ClipboardList size={22} color="#C9A227" /> Moje objednávky
      </h1>
      <p style={{ color: "#8B92A6", fontSize: 13, marginBottom: 22 }}>
        Objednávky odeslané z tohoto zařízení. Prodejce o nich ví a ozve se ti. Platbu můžeš provést QR kódem u dané objednávky.
      </p>
      {orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: "#8B92A6" }}>
          Zatím žádné objednávky.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map((o) => <OrderCard key={o.id} order={o} />)}
        </div>
      )}
    </div>
  );
}

function AdminOrdersView({ showToast, refreshCards, onUnauthorized }) {
  const [orders, setOrders] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    try {
      const d = await api("/api/orders");
      setOrders(d.orders);
      setErr("");
    } catch (e) {
      if (e.status === 401) onUnauthorized();
      setErr(e.message);
      setOrders((o) => o ?? []);
    }
  }
  useEffect(() => { load(); }, []);

  async function cancel(id) {
    try {
      await api(`/api/orders?id=${id}`, { method: "DELETE" });
      await load();
      await refreshCards();
      showToast("Objednávka zrušena, karty vráceny na sklad");
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div style={{ maxWidth: 680, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 10 }}>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
          <ClipboardList size={22} color="#C9A227" /> Objednávky
        </h1>
        <button onClick={load} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #2A2E3D", color: "#8B92A6", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, cursor: "pointer" }}>
          <RefreshCw size={13} /> Obnovit
        </button>
      </div>
      {err && <div role="alert" style={{ color: "#E26D68", fontSize: 13, marginBottom: 12 }}>{err}</div>}
      {orders === null ? (
        <div style={{ color: "#8B92A6", textAlign: "center", padding: 40 }}>Načítám…</div>
      ) : orders.length === 0 ? (
        <div style={{ textAlign: "center", padding: "50px 0", color: "#8B92A6" }}>Zatím žádné objednávky.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map((o) => <OrderCard key={o.id} order={o} admin onCancel={cancel} />)}
        </div>
      )}
    </div>
  );
}

function LoginView({ admin, onLogin, onLogout }) {
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true);
    setError("");
    const r = await onLogin(pw);
    setBusy(false);
    if (!r.ok) setError(r.message);
  }
  const inputStyle = { width: "100%", background: "#1B1E2A", color: "#EDEAE0", border: "1px solid #2A2E3D", borderRadius: 8, padding: "10px 12px", fontSize: 14 };
  return (
    <div style={{ maxWidth: 360, margin: "40px auto" }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
        <Lock size={20} color="#C9A227" /> Správce
      </h1>
      {admin ? (
        <div>
          <p style={{ color: "#C7CBD6", fontSize: 14 }}>Jsi přihlášený jako správce.</p>
          <button onClick={onLogout} style={{ marginTop: 8, background: "transparent", border: "1px solid #2A2E3D", color: "#EDEAE0", borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}>Odhlásit</button>
        </div>
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: 12 }}>
          <label htmlFor="pw" style={{ fontSize: 12, color: "#8B92A6" }}>Heslo správce</label>
          <input id="pw" type="password" autoComplete="current-password" style={inputStyle} value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="submit" disabled={!pw || busy}
            style={{ padding: 12, borderRadius: 10, border: "none", background: pw && !busy ? "#C9A227" : "#2A2E3D", color: pw && !busy ? "#12141C" : "#6b7280", fontWeight: 600, cursor: pw && !busy ? "pointer" : "not-allowed" }}>
            {busy ? "Ověřuji…" : "Přihlásit"}
          </button>
          {error && <div role="alert" style={{ fontSize: 12.5, color: "#E26D68" }}>{error}</div>}
        </form>
      )}
    </div>
  );
}

function SellView({ onAdd }) {
  const [form, setForm] = useState({
    name: "", description: "", condition: "Near Mint", price: "", qty: 1, image: null,
  });
  const [imgError, setImgError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const canSubmit = form.name.trim().length > 0 && Number(form.price) > 0 && Number(form.qty) > 0;

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setSubmitError("");
    const r = await onAdd({ ...form, price: Number(form.price), qty: Number(form.qty) });
    setBusy(false);
    if (r.ok) {
      setForm({ name: "", description: "", condition: "Near Mint", price: "", qty: 1, image: null });
      setImgError("");
    } else {
      setSubmitError(r.message);
    }
  }

  function onImagePick(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setImgError("Soubor je moc velký (max 20 MB).");
      return;
    }
    setImgError("");
    const reader = new FileReader();
    reader.onerror = () => setImgError("Obrázek se nepodařilo načíst.");
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setImgError("Tohle není platný obrázek.");
      img.onload = () => {
        // zmenšení na max 600 px a komprese do JPEG, aby se karta ukládala rychle a malá
        const MAX = 520;
        const scale = Math.min(1, MAX / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#12141C";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        let q = 0.8;
        let url = canvas.toDataURL("image/jpeg", q);
        while (url.length > 280000 && q > 0.35) { q -= 0.1; url = canvas.toDataURL("image/jpeg", q); }
        setForm((f) => ({ ...f, image: url }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  const inputStyle = {
    width: "100%", background: "#1B1E2A", color: "#EDEAE0", border: "1px solid #2A2E3D",
    borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "'Inter', sans-serif",
  };
  const label = { fontSize: 12, color: "#8B92A6", marginBottom: 6, display: "block" };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 280px", gap: 40, maxWidth: 820, margin: "0 auto" }}>
      <div>
        <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginBottom: 22, display: "flex", alignItems: "center", gap: 10 }}>
          <Wand2 size={22} color="#C9A227" /> Přidat kartu do nabídky
        </h1>
        <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
          <div>
            <label style={label}>Název karty</label>
            <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="např. Marek Dvořák — Zlatá sezóna" />
          </div>
          <div>
            <label style={label}>Popis karty</label>
            <textarea
              style={{ ...inputStyle, minHeight: 80, resize: "vertical", fontFamily: "'Inter', sans-serif" }}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="např. edice, ročník, číslování, drobné vady…"
            />
          </div>
          <div>
            <label style={label}>Vlastní obrázek karty (nepovinné)</label>
            <input type="file" accept="image/*" onChange={onImagePick} style={{ ...inputStyle, padding: "8px 10px" }} />
            {imgError && <div style={{ color: "#B3423E", fontSize: 12, marginTop: 6 }}>{imgError}</div>}
            {form.image && (
              <button
                type="button"
                onClick={() => setForm((f) => ({ ...f, image: null }))}
                style={{ marginTop: 8, background: "transparent", border: "1px solid #2A2E3D", color: "#8B92A6", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
              >
                Odebrat obrázek
              </button>
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <label style={label}>Stav</label>
              <select style={inputStyle} value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })}>
                {CONDITIONS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={label}>Cena (Kč)</label>
              <input type="number" min="1" style={inputStyle} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="0" />
            </div>
          </div>
          <div>
            <label style={label}>Počet kusů</label>
            <input type="number" min="1" style={inputStyle} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} />
          </div>
          <button
            type="submit"
            disabled={!canSubmit || busy}
            style={{
              marginTop: 4, padding: "12px", borderRadius: 10, border: "none",
              background: canSubmit ? "#C9A227" : "#2A2E3D",
              color: canSubmit ? "#12141C" : "#6b7280",
              fontWeight: 600, fontSize: 14, cursor: canSubmit ? "pointer" : "not-allowed",
            }}
          >
            {busy ? "Ukládám…" : "Přidat do nabídky"}
          </button>
          {submitError && <div role="alert" style={{ fontSize: 12.5, color: "#E26D68" }}>{submitError}</div>}
        </form>
      </div>
      <div>
        <label style={label}>Náhled</label>
        <CardFace card={{ ...form, name: form.name || "Název karty", price: form.price || 0 }} />
      </div>
    </div>
  );
}

// ---------- dashboard ----------

function DashboardView({ totalValue, totalCards, topCards }) {
  return (
    <div>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 600, marginBottom: 22 }}>Hodnota sbírky</h1>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 32 }}>
        <StatCard icon={Coins} label="Celková hodnota nabídky" value={CZK(totalValue)} />
        <StatCard icon={LayoutGrid} label="Karet skladem" value={totalCards + " ks"} />
        <StatCard icon={Sparkles} label="Průměrná cena karty" value={totalCards ? CZK(Math.round(totalValue / totalCards)) : "—"} />
      </div>

      <div style={{ background: "#1B1E2A", border: "1px solid #23263380", borderRadius: 14, padding: 20, marginBottom: 24 }}>
        <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, margin: "0 0 16px" }}>Nejcennější karty</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={topCards} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid stroke="#23263380" horizontal={false} />
            <XAxis type="number" stroke="#8B92A6" fontSize={11} tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v} />
            <YAxis type="category" dataKey="name" stroke="#8B92A6" fontSize={11} width={140} tickFormatter={(v) => v.length > 18 ? v.slice(0, 18) + "…" : v} />
            <Tooltip
              contentStyle={{ background: "#12141C", border: "1px solid #2A2E3D", borderRadius: 8, fontSize: 12 }}
              formatter={(v) => [CZK(v), "Cena"]}
            />
            <Bar dataKey="price" radius={[0, 6, 6, 0]} fill={ACCENT.tint} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value }) {
  return (
    <div style={{ background: "#1B1E2A", border: "1px solid #23263380", borderRadius: 14, padding: 18 }}>
      <Icon size={16} color="#C9A227" />
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, marginTop: 10 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#8B92A6", marginTop: 2 }}>{label}</div>
    </div>
  );
}

// ---------- legal pages ----------

function LegalPage({ title, children }) {
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600, marginBottom: 18 }}>{title}</h1>
      <div style={{ fontSize: 14, lineHeight: 1.7, color: "#C7CBD6", display: "grid", gap: 14 }}>
        {children}
      </div>
    </div>
  );
}
function H2({ children }) {
  return <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 600, color: "#EDEAE0", margin: "6px 0 0" }}>{children}</h2>;
}

function TermsView() {
  return (
    <LegalPage title="Obchodní podmínky">
      <p style={{ fontSize: 12.5, color: "#8B92A6" }}>
        Toto je obecná šablona, ne hotový právní dokument. {SELLER.note}
      </p>
      <H2>1. Prodejce</H2>
      <p>{SELLER.name}, {SELLER.address}. IČO: {SELLER.ico}. Kontakt: {SELLER.email}.</p>
      <H2>2. Uzavření kupní smlouvy</H2>
      <p>Odesláním objednávky v košíku kupující potvrzuje souhlas s cenou, popisem a stavem vybraných karet. Kupní smlouva vzniká potvrzením objednávky prodejcem (e-mailem nebo jinou domluvou).</p>
      <H2>3. Cena a platba</H2>
      <p>Ceny karet jsou uvedené u každé nabídky v Kč. Platit lze bankovním převodem pomocí QR kódu, který se zobrazí po odeslání objednávky. Doručení se domlouvá individuálně — prodejce kupujícího po odeslání objednávky kontaktuje.</p>
      <H2>4. Odstoupení od smlouvy (14 dní)</H2>
      <p>Kupující má právo odstoupit od smlouvy do 14 dnů od převzetí zboží bez udání důvodu, a to písemně na e-mail {SELLER.email}. Zboží je nutné vrátit nepoškozené, kompletní, ideálně v původním stavu. Peníze budou vráceny do 14 dnů od doručení vráceného zboží.</p>
      <H2>5. Stav karet</H2>
      <p>Stav každé karty (Mint, Near Mint, Excellent, Použitá) je uveden v nabídce. Drobné odchylky dané povahou sběratelského zboží nejsou vadou.</p>
      <H2>6. Závěrečná ustanovení</H2>
      <p>Vztahy neupravené těmito podmínkami se řídí občanským zákoníkem (zákon č. 89/2012 Sb.).</p>
    </LegalPage>
  );
}

function PrivacyView() {
  return (
    <LegalPage title="Ochrana osobních údajů">
      <p style={{ fontSize: 12.5, color: "#8B92A6" }}>
        Obecná šablona v souladu se zásadami GDPR — doporučujeme nechat zkontrolovat, začneš-li prodávat pravidelně.
      </p>
      <H2>1. Správce údajů</H2>
      <p>{SELLER.name}, kontakt: {SELLER.email}.</p>
      <H2>2. Jaké údaje zpracováváme</H2>
      <p>Při odeslání objednávky ukládáme jméno, telefon, nepovinně e-mail, adresu a poznámku, které kupující sám vyplní v košíku — pouze za účelem vyřízení objednávky.</p>
      <H2>3. Účel a doba zpracování</H2>
      <p>Údaje slouží výhradně ke komunikaci ohledně objednávky a jejímu doručení. Uchovávají se po dobu nutnou k vyřízení objednávky a případné reklamaci.</p>
      <H2>4. Kdo má k údajům přístup</H2>
      <p>Údaje se ukládají v databázi obchodu a prodejce o nich dostane oznámení (zprávou nebo e-mailem). Jsou přístupné jen prodejci a neposkytují se dalším osobám. Kopie vlastní objednávky si kupující ukládá také ve svém zařízení.</p>
      <H2>5. Práva kupujícího</H2>
      <p>Kupující má právo požádat o výmaz, opravu nebo přehled svých údajů — stačí napsat na {SELLER.email}.</p>
    </LegalPage>
  );
}

function ComplaintsView() {
  return (
    <LegalPage title="Reklamační řád">
      <p style={{ fontSize: 12.5, color: "#8B92A6" }}>
        Obecná šablona, ne hotový právní dokument.
      </p>
      <H2>1. Uplatnění reklamace</H2>
      <p>Reklamaci lze uplatnit e-mailem na {SELLER.email}, ideálně s popisem vady a fotografií karty.</p>
      <H2>2. Lhůta pro vyřízení</H2>
      <p>Reklamace bude vyřízena nejpozději do 30 dnů od jejího uplatnění, pokud se strany nedohodnou jinak.</p>
      <H2>3. Co reklamace nezahrnuje</H2>
      <p>Reklamaci nelze uplatnit na vady odpovídající uvedenému stavu karty (např. běžné opotřebení u karty ve stavu „Použitá"), pokud byl stav v nabídce správně popsán.</p>
      <H2>4. Řešení sporu</H2>
      <p>Nedojde-li k dohodě, může se kupující obrátit na Českou obchodní inspekci (coi.cz) nebo příslušný soud.</p>
    </LegalPage>
  );
}
