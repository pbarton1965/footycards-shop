import { useState, useEffect, useMemo, useRef } from "react";
import QRCode from "qrcode";
import {
  ShoppingCart, Search, Plus, Trash2, Sparkles, LayoutGrid,
  BarChart3, Minus, X, PackagePlus, Wand2, Coins, ClipboardList, User2, CheckCircle2,
  Pencil, Check, LogOut, Lock, RefreshCw, RotateCw
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
  import FlipCard from "./FlipCard.jsx";
// ---------- constants ----------

const ACCENT = { tint: "#C9A227", glow: "rgba(201,162,39,0.5)" };
const CONDITIONS = ["Mint", "Near Mint", "Excellent", "Použitá"];
const EMPTY_BUYER = { name: "", phone: "", email: "", address: "", note: "" };

const CZK = (n) => Number(n).toLocaleString("cs-CZ") + " Kč";
const SHOP_EMAIL = "pbartonvozice@seznam.cz";
// TODO: doplň skutečné údaje prodejce — zobrazují se v Obchodních podmínkách a GDPR
const SELLER = {
  name: "[Petr Bartoň]",
  address: "[Aloise Mareše 180,Mladá Vožice,39143]",
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

// ---------- obrázky ----------

const MAX_SIDE = 800;        // delší strana obrázku po zmenšení (px)
const MAX_DATAURL = 330000;  // největší povolená velikost jedné strany (znaků); server povoluje 450 000

// adresa obrázku karty: čerstvě vybraný (dataURL) nebo ze serveru; v=… obejde starou mezipaměť
function imgUrl(card, side) {
  if (side === "back") {
    return card.imageBack || (card.hasBack ? `/api/image?id=${card.id}&side=back&v=${card.imgv || 0}` : null);
  }
  return card.image || (card.hasImage ? `/api/image?id=${card.id}&v=${card.imgv || 0}` : null);
}

// vybraný soubor -> zmenšený JPEG (dataURL), poměr stran zůstává, fotka se neořezává
function imageFileToJpeg(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error("Nebyl vybrán žádný soubor."));
    if (file.size > 25 * 1024 * 1024) return reject(new Error("Soubor je moc velký (max 25 MB)."));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Obrázek se nepodařilo načíst."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Tohle není platný obrázek."));
      img.onload = () => {
        let scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
        for (let attempt = 0; attempt < 6; attempt++) {
          const w = Math.max(1, Math.round(img.width * scale));
          const h = Math.max(1, Math.round(img.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#12141C";
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          let q = 0.85;
          let url = canvas.toDataURL("image/jpeg", q);
          while (url.length > MAX_DATAURL && q > 0.45) { q -= 0.1; url = canvas.toDataURL("image/jpeg", q); }
          if (url.length <= MAX_DATAURL) return resolve(url);
          scale *= 0.8; // pořád moc velké -> zmenšit rozměry a zkusit znovu
        }
        reject(new Error("Obrázek se nepodařilo dostatečně zmenšit."));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function CardFace({ card, size = "normal", onOpen }) {
  const r = ACCENT;
  const small = size === "small";
  const ref = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [side, setSide] = useState("front");

  function onMove(e) {
    const el = ref.current;
    if (!el || small) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({ x: py * -8, y: px * 10 });
  }
  function onLeave() { setTilt({ x: 0, y: 0 }); }

  const frontSrc = imgUrl(card, "front");
  const backSrc = imgUrl(card, "back");
  const shown = side === "back" && backSrc ? "back" : "front";
  const src = shown === "back" ? backSrc : frontSrc;
  const openable = Boolean(onOpen && src);

  return (
    <div style={{ width: "100%" }}>
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={openable ? onOpen : undefined}
      onKeyDown={openable ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      role={openable ? "button" : undefined}
      tabIndex={openable ? 0 : undefined}
      aria-label={openable ? `Zvětšit kartu ${card.name}` : undefined}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "5 / 7",
        borderRadius: small ? 8 : 14,
        overflow: "hidden",
        background: "linear-gradient(155deg, #1B1E2A 0%, #12141C 60%)",
        border: `1px solid ${r.tint}55`,
        boxShadow: `0 12px 30px -12px ${r.glow}`,
        transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: "transform 120ms ease-out",
        cursor: openable ? "zoom-in" : "default",
      }}
    >
      {src ? (
        <img
          key={src}
          src={src}
          alt={`${card.name || "Karta"} – ${shown === "back" ? "rub" : "líc"}`}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <>
          <div
            className="foil-sweep"
            style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(115deg, transparent 30%, ${r.tint}33 45%, ${r.tint}88 50%, ${r.tint}33 55%, transparent 70%)`,
              backgroundSize: "250% 250%",
            }}
          />
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              width: small ? "50%" : "42%", aspectRatio: "1 / 1", borderRadius: "50%",
              border: `2px solid ${r.tint}`, display: "flex", alignItems: "center", justifyContent: "center",
              filter: `drop-shadow(0 0 14px ${r.glow})`,
            }}>
              <span style={{ fontFamily: "'Fraunces', serif", fontSize: small ? 14 : 34, fontWeight: 700, color: r.tint, opacity: 0.9 }}>
                {(card.name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}
              </span>
            </div>
          </div>
        </>
      )}

    </div>
    {!small && backSrc && (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#8B92A6" }}>{shown === "back" ? "RUB" : "LÍC"}</span>
        <button
          type="button"
          aria-label="Otočit kartu"
          title={shown === "back" ? "Zobrazit líc" : "Zobrazit rub"}
          onClick={() => setSide(shown === "back" ? "front" : "back")}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "1px solid #C9A22766", color: "#C9A227", borderRadius: 8, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
        >
          <RotateCw size={13} /> Otočit
        </button>
      </div>
    )}
    </div>
  );
}

// Zvětšený náhled karty: líc i rub vedle sebe
function CardModal({ card, onClose, onAdd }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sides = [["líc", imgUrl(card, "front")], ["rub", imgUrl(card, "back")]].filter(([, s]) => s);
  const frontSrc = imgUrl(card, "front");
  const backSrc = imgUrl(card, "back");
  return ( 

  
    <div
      role="dialog"
      aria-modal="true"
      aria-label={card.name}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(8,9,13,0.88)", zIndex: 60, overflowY: "auto", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px" }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#1B1E2A", border: "1px solid #2A2E3D", borderRadius: 16, padding: 20, width: "100%", maxWidth: 860, margin: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 600, margin: 0 }}>{card.name}</h2>
          <button onClick={onClose} aria-label="Zavřít" style={{ background: "transparent", border: "1px solid #2A2E3D", color: "#8B92A6", borderRadius: 8, width: 32, height: 32, cursor: "pointer", flexShrink: 0 }}>
            <X size={15} style={{ margin: "auto" }} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginBottom: 16 }}>
          {sides.length === 0 ? (
            <div style={{ width: 240 }}><CardFace card={card} /></div>
      ) : frontSrc && backSrc ? (
            <div style={{ flex: "1 1 280px", maxWidth: 380 }}><FlipCard front={frontSrc} back={backSrc} alt={card.name} /></div>
          ) : sides.map(([label, src]) => (
            <figure key={label} style={{ margin: 0, flex: "1 1 280px", maxWidth: 380 }}>
              <img src={src} alt={`${card.name} – ${label}`} style={{ width: "100%", aspectRatio: "5 / 7", objectFit: "contain", background: "#12141C", borderRadius: 12, border: "1px solid #2A2E3D", display: "block" }} />
              <figcaption style={{ textAlign: "center", fontSize: 11.5, color: "#8B92A6", marginTop: 6, fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase" }}>{label}</figcaption>
            </figure>
          ))}
        </div>
        {card.description && <p style={{ fontSize: 14, color: "#C7CBD6", lineHeight: 1.6, margin: "0 0 14px" }}>{card.description}</p>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, color: "#C9A227" }}>{CZK(card.price)}</div>
            <div style={{ fontSize: 12, color: "#8B92A6" }}>{card.condition} · {card.qty > 0 ? `skladem ${card.qty}×` : "vyprodáno"}</div>
          </div>
          <button
            onClick={() => onAdd(card)}
            disabled={card.qty <= 0}
            style={{ display: "flex", alignItems: "center", gap: 8, background: card.qty > 0 ? "#C9A227" : "#2A2E3D", color: "#12141C", border: "none", borderRadius: 10, padding: "11px 18px", fontWeight: 600, fontSize: 14, cursor: card.qty > 0 ? "pointer" : "not-allowed" }}
          >
            <ShoppingCart size={15} /> Přidat do košíku
          </button>
        </div>
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

  async function placeOrder(buyerInfo, shipping) {
    if (cartItems.length === 0) return { ok: false, message: "Košík je prázdný." };
    try {
      const data = await api("/api/order", {
        method: "POST",
        body: { items: cartItems.map(({ card, qty }) => ({ id: card.id, qty })), buyer: buyerInfo, shipping, termsAccepted: true },
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
         <a
        href="https://www.facebook.com/profile.php?id=100014208840855"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#8B92A6", fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        Facebook
      </a>
      <a
        href="https://www.instagram.com/footycardscz/"
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: "#8B92A6", fontSize: 12.5, textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        Instagram
      </a>
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
  const [detailId, setDetailId] = useState(null);
  const detail = detailId ? cards.find((x) => x.id === detailId) : null;
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
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 16 }}>
          {cards.map((card) => (
            <div key={card.id} className="card-btn" style={{ transition: "transform 150ms", opacity: card.qty <= 0 ? 0.55 : 1 }}>
              <CardFace card={card} onOpen={() => setDetailId(card.id)} />
              <div style={{ marginTop: 10 }}>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{card.name}</div>
                {card.description && (
                  <div style={{ fontSize: 11.5, color: "#8B92A6", marginTop: 3, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                    {card.description}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 15, fontWeight: 500, color: "#C9A227" }}>
                    {CZK(card.price)}
                  </div>
                  <div style={{ fontSize: 11, color: "#8B92A6" }}>{card.condition} · <span>{card.qty > 0 ? `skladem ${card.qty}×` : "vyprodáno"}</span></div>
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
      {detail && <CardModal card={detail} onClose={() => setDetailId(null)} onAdd={addToCart} />}
    </div>
  );
}

// ---------- cart ----------

function CartView({ items, total, onQty, onRemove, onPlaceOrder, onBack, initialBuyer, onNavigate }) {
  const [buyer, setBuyer] = useState(initialBuyer || { name: "", phone: "", email: "", address: "", note: "" });
  const [agreed, setAgreed] = useState(false);
  const [pickupPoint, setPickupPoint] = useState(null);
  const [widgetBusy, setWidgetBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email.trim());
const canOrder = items.length > 0 && buyer.name.trim().length > 0 && buyer.phone.trim().length > 0 && emailValid && agreed && Boolean(pickupPoint);

  async function choosePacketaPoint() {
    const apiKey = import.meta.env.VITE_PACKETA_API_KEY;
    if (!apiKey) {
      setError("Výběr Zásilkovny není nakonfigurován. Prodejce musí doplnit VITE_PACKETA_API_KEY.");
      return;
    }
    setError("");
    setWidgetBusy(true);
    try {
      if (!window.Packeta?.Widget?.pick) {
        await new Promise((resolve, reject) => {
          const existing = document.querySelector('script[data-packeta-widget="true"]');
          if (existing) {
            existing.addEventListener("load", resolve, { once: true });
            existing.addEventListener("error", reject, { once: true });
            if (window.Packeta?.Widget?.pick) resolve();
            return;
          }
          const script = document.createElement("script");
          script.src = "https://widget.packeta.com/v6/www/js/library.js";
          script.async = true;
          script.dataset.packetaWidget = "true";
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }
      if (!window.Packeta?.Widget?.pick) throw new Error("Widget Zásilkovny se nepodařilo načíst.");
      window.Packeta.Widget.pick(apiKey, (point) => {
        if (!point) { setWidgetBusy(false); return; }
        setPickupPoint({
          id: String(point.id || point.pointId || ""),
          name: String(point.name || point.place || "Výdejní místo"),
          street: String(point.street || ""),
          city: String(point.city || ""),
          zip: String(point.zip || point.zipCode || ""),
          country: String(point.country || "cz"),
        });
        setWidgetBusy(false);
      });
    } catch {
      setError("Výběr výdejního místa se nepodařilo otevřít. Zkus to prosím znovu.");
      setWidgetBusy(false);
    }
  }

  async function submit() {
    if (!canOrder || busy) return;
    setBusy(true);
    setError("");
    const r = await onPlaceOrder(buyer, { method: "packeta", pickupPoint });
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
            <h3 style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600, margin: "0 0 10px" }}>Doprava</h3>
            <div style={{ fontSize: 13, color: "#EDEAE0", marginBottom: 8 }}>Zásilkovna – výdejní místo nebo Z-BOX</div>
            <button type="button" onClick={choosePacketaPoint} disabled={widgetBusy}
              style={{ background: "#C9A227", color: "#12141C", border: "none", borderRadius: 8, padding: "9px 12px", fontWeight: 600, cursor: "pointer" }}>
              {widgetBusy ? "Načítám výběr…" : pickupPoint ? "Změnit výdejní místo" : "Vybrat výdejní místo"}
            </button>
            {pickupPoint && <div style={{ fontSize: 12.5, color: "#C7CBD6", marginTop: 8 }}>
              Vybráno: {pickupPoint.name}{pickupPoint.street ? `, ${pickupPoint.street}` : ""}{pickupPoint.city ? `, ${pickupPoint.city}` : ""}{pickupPoint.zip ? ` ${pickupPoint.zip}` : ""}
            </div>}
            <div style={{ fontSize: 11.5, color: "#8B92A6", marginTop: 8 }}>Cena dopravy se domluví a potvrdí před uzavřením objednávky; součet níže zahrnuje pouze karty.</div>
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
            <label style={label}>E-mail *</label> 
             <input
  type="email"
  required
  style={inputStyle}
  value={buyer.email}
  onChange={(e) => setBuyer({ ...buyer, email: e.target.value })}
  placeholder="jan@email.cz"
/>   
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
              {" "}a potvrzuji, že jsem se seznámil(a) s{" "}
              <button type="button" onClick={() => onNavigate("privacy")} style={{ background: "none", border: "none", padding: 0, color: "#C9A227", textDecoration: "underline", cursor: "pointer", fontSize: "inherit" }}>informacemi o zpracování osobních údajů</button>.
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
              {!pickupPoint ? "Vyber prosím výdejní místo Zásilkovny." : !agreed ? "Potvrď prosím souhlas s podmínkami." : "Vyplň prosím jméno a telefon a platný e-mail."}
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
      {o.shipping?.method === "packeta" && o.shipping.pickupPoint && (
        <div style={{ fontSize: 12.5, color: "#C7CBD6", background: "#12141C", border: "1px solid #23263380", borderRadius: 8, padding: "8px 10px", marginBottom: 12 }}>
          <strong>Zásilkovna:</strong> {o.shipping.pickupPoint.name}{o.shipping.pickupPoint.street ? `, ${o.shipping.pickupPoint.street}` : ""}{o.shipping.pickupPoint.city ? `, ${o.shipping.pickupPoint.city}` : ""}{o.shipping.pickupPoint.zip ? ` ${o.shipping.pickupPoint.zip}` : ""}
          <div style={{ color: "#8B92A6" }}>ID výdejního místa: {o.shipping.pickupPoint.id}</div>
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

function ImagePicker({ label, hint, value, onChange }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function pick(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // dovolí vybrat stejný soubor znovu
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      onChange(await imageFileToJpeg(file));
    } catch (err) {
      setError(err.message);
    }
    setBusy(false);
  }
  return (
    <div>
      <label style={{ fontSize: 12, color: "#8B92A6", marginBottom: 6, display: "block" }}>{label}</label>
      <input
        type="file" accept="image/*" aria-label={label} onChange={pick}
        style={{ width: "100%", background: "#1B1E2A", color: "#EDEAE0", border: "1px solid #2A2E3D", borderRadius: 8, padding: "8px 10px", fontSize: 13 }}
      />
      {busy && <div style={{ fontSize: 12, color: "#8B92A6", marginTop: 6 }}>Zpracovávám obrázek…</div>}
      {error && <div role="alert" style={{ color: "#E26D68", fontSize: 12, marginTop: 6 }}>{error}</div>}
      {value && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <img src={value} alt="" style={{ width: 40, aspectRatio: "5 / 7", objectFit: "contain", background: "#12141C", borderRadius: 4, border: "1px solid #2A2E3D" }} />
          <span style={{ fontSize: 12, color: "#8B92A6" }}>nahráno, {Math.round((value.length * 0.75) / 1024)} kB</span>
          <button type="button" onClick={() => onChange(null)}
            style={{ background: "transparent", border: "1px solid #2A2E3D", color: "#8B92A6", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer" }}>
            Odebrat
          </button>
        </div>
      )}
      {hint && !value && <div style={{ fontSize: 11.5, color: "#6b7280", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

const EMPTY_FORM = { name: "", description: "", condition: "Near Mint", price: "", qty: 1, image: null, imageBack: null };

function SellView({ onAdd }) {
  const [form, setForm] = useState(EMPTY_FORM);
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
    if (r.ok) setForm(EMPTY_FORM);
    else setSubmitError(r.message);
  }

  const inputStyle = {
    width: "100%", background: "#1B1E2A", color: "#EDEAE0", border: "1px solid #2A2E3D",
    borderRadius: 8, padding: "10px 12px", fontSize: 14, fontFamily: "'Inter', sans-serif",
  };
  const label = { fontSize: 12, color: "#8B92A6", marginBottom: 6, display: "block" };

  return (
    <div className="sell-grid" style={{ maxWidth: 860, margin: "0 auto" }}>
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
          <ImagePicker
            label="Přední strana karty (obrázek)"
            hint="Nejlépe fotka karty na výšku. Velké fotky z telefonu se zmenší samy a neořezávají se."
            value={form.image}
            onChange={(v) => setForm((f) => ({ ...f, image: v, imageBack: v ? f.imageBack : null }))}
          />
          {form.image && (
            <ImagePicker
              label="Zadní strana karty (nepovinné)"
              hint="Zákazník si kartu v obchodě otočí tlačítkem."
              value={form.imageBack}
              onChange={(v) => setForm((f) => ({ ...f, imageBack: v }))}
            />
          )}
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
      <div className="sell-preview">
        <label style={label}>Náhled (tak ji uvidí zákazník)</label>
        <CardFace card={{ ...form, name: form.name || "Název karty", price: form.price || 0 }} />
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 600 }}>{form.name || "Název karty"}</div>
          <div style={{ fontSize: 11.5, color: "#8B92A6", marginTop: 3 }}>{form.condition}</div>
          {form.description && <div style={{ fontSize: 11.5, color: "#8B92A6", marginTop: 3, lineHeight: 1.4 }}>{form.description}</div>}
        </div>
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
        Výchozí šablona, kterou je před zveřejněním potřeba přizpůsobit skutečnému postavení prodávajícího, jeho kontaktním údajům a podmínkám dopravy.
      </p>
      <H2>1. Prodávající</H2>
      <p>{SELLER.name}, {SELLER.address}. IČO: {SELLER.ico}. Kontakt: {SELLER.email}.</p>

      <H2>2. Nabídka a stav karet</H2>
      <p>Každá karta je popsána vlastním názvem, cenou, dostupným množstvím a uvedeným stavem. Kupující se před objednáním seznámí s popisem a fotografiemi konkrétní karty. U sběratelských karet může být běžné opotřebení odpovídající uvedenému stavu; popis stavu však neomezuje práva z vadného plnění, která nelze smluvně vyloučit.</p>

      <H2>3. Objednávka a uzavření smlouvy</H2>
      <p>Odesláním objednávky kupující předkládá návrh na uzavření kupní smlouvy. Objednávka se uloží a prodávající kupujícího kontaktuje. Kupní smlouva je uzavřena potvrzením objednávky prodávajícím. Potvrzení přijetí objednávky samo o sobě není potvrzením jejího přijetí prodávajícím.</p>

      <H2>4. Cena, platba a dodání</H2>
      <p>Ceny karet jsou uvedeny v českých korunách. Součet v košíku zahrnuje ceny karet; případná cena dopravy v něm není zahrnuta a bude kupujícímu sdělena před potvrzením objednávky. Způsob a cenu dopravy si strany dohodnou individuálně.</p>
      <p>Je-li u objednávky zobrazen QR kód, lze zaplatit bankovním převodem podle uvedených údajů. Není-li QR platba dostupná, prodávající s kupujícím dohodne jiný způsob platby. Údaje k platbě a variabilní symbol musí odpovídat konkrétní objednávce.</p>

      <H2>5. Odstoupení od smlouvy</H2>
      <p>Pokud prodávající při konkrétním prodeji jedná jako podnikatel a kupující jako spotřebitel, může kupující u smlouvy uzavřené na dálku odstoupit bez udání důvodu do 14 dnů ode dne převzetí zboží, nestanoví-li zákon výjimku. Lhůta je zachována, pokud kupující odešle oznámení o odstoupení před jejím uplynutím.</p>
      <p>Odstoupení lze oznámit na {SELLER.email} jednoznačným prohlášením, ze kterého je patrné, od které objednávky nebo její části kupující odstupuje. Zboží odešle kupující zpět bez zbytečného odkladu, nejpozději do 14 dnů od oznámení odstoupení, na adresu {SELLER.address}. Lhůta je zachována, pokud kupující odešle zboží před jejím uplynutím.</p>
      <p>Přímé náklady na vrácení zboží nese kupující, pokud o tom byl před uzavřením smlouvy informován; jinak je nese prodávající. Prodávající vrátí všechny přijaté platby včetně nákladů na dodání ve výši odpovídající nejlevnějšímu nabízenému způsobu dodání, a to do 14 dnů od odstoupení a stejným způsobem, jakým platbu přijal, pokud se strany nedohodnou jinak. S vrácením peněz může vyčkat do chvíle, kdy obdrží vrácené zboží nebo doklad o jeho odeslání, podle toho, co nastane dříve. Kupující odpovídá za snížení hodnoty zboží, které vzniklo nakládáním nad rámec nezbytný k seznámení se s jeho povahou, vlastnostmi a funkčností.</p>
      <p>Pokud prodávající při konkrétním prodeji nejedná jako podnikatel, zákonné spotřebitelské právo na odstoupení od smlouvy uzavřené na dálku se neuplatní; prodávající a kupující se však mohou na vrácení zboží dohodnout.</p>
      <p>Vzorový formulář pro případ, že se na smlouvu vztahuje zákonné právo spotřebitele na odstoupení:</p>
      <div style={{ padding: 12, border: "1px solid #2A2E3D", borderRadius: 8 }}>
        <p>Adresát: {SELLER.name}, {SELLER.address}, {SELLER.email}</p>
        <p>Oznamuji, že tímto odstupuji od smlouvy o nákupu tohoto zboží: [název karty].</p>
        <p>Číslo objednávky: [číslo]. Datum objednání / datum převzetí: [datum].</p>
        <p>Jméno a příjmení spotřebitele: [údaj]. Adresa spotřebitele: [adresa].</p>
        <p>Podpis spotřebitele (pouze při oznámení v listinné podobě): [podpis]. Datum: [datum].</p>
      </div>

      <H2>6. Práva z vadného plnění a reklamace</H2>
      <p>Vadu nebo nesoulad karty s jejím popisem může kupující oznámit na {SELLER.email}. Uvede číslo objednávky, kartu a popis problému; fotografie může pomoci věc posoudit. Práva kupujícího a způsob vyřízení se řídí právními předpisy a postavením stran. Uvedený stav karty ani její běžné opotřebení samo o sobě nevylučuje práva z vady, která nebyla v popisu uvedena nebo kterou nelze smluvně vyloučit.</p>

      <H2>7. Mimosoudní řešení spotřebitelských sporů</H2>
      <p>Je-li kupující spotřebitelem a prodávající podnikatelem, může se kupující s nevyřešeným spotřebitelským sporem obrátit na Českou obchodní inspekci v rámci mimosoudního řešení sporů. Více informací je na <a href="https://coi.gov.cz/" target="_blank" rel="noreferrer" style={{ color: "#C9A227" }}>coi.gov.cz</a>.</p>

      <H2>8. Závěrečná ustanovení</H2>
      <p>Právní vztahy se řídí právním řádem České republiky. Nic v těchto podmínkách neomezuje práva, od kterých se nelze odchýlit v neprospěch kupujícího.</p>
    </LegalPage>
  );
}
function PrivacyView() {
  return (
    <LegalPage title="Ochrana osobních údajů">
      <p style={{ fontSize: 12.5, color: "#8B92A6" }}>
        Tyto informace popisují zpracování údajů při objednávce v obchodě. Před zveřejněním správce doplní a ověří své identifikační údaje, konkrétní poskytovatele e-mailu a Telegramu, případné předávání údajů mimo EU včetně použitých záruk a pravidla uchovávání podle skutečného nastavení.
      </p>

      <H2>1. Správce osobních údajů</H2>
      <p>Správcem je {SELLER.name}, {SELLER.address}. Kontakt pro dotazy a uplatnění práv: {SELLER.email}.</p>

      <H2>2. Jaké údaje zpracováváme</H2>
      <p>Pro objednávku jsou povinné jméno, telefon a e-mail. Dále zpracováváme položky objednávky, jejich počet a cenu, celkovou částku, číslo a datum objednávky, platební částku a variabilní symbol. Dodací adresu a poznámku může kupující vyplnit dobrovolně.</p>

      <H2>3. Účel a právní základ</H2>
      <p>Údaje používáme k přijetí a vyřízení objednávky, komunikaci s kupujícím, předání zboží a zpracování platby. Právním základem je jednání před uzavřením smlouvy a plnění kupní smlouvy. Údaje, které je nutné uchovat podle právních předpisů, zpracováváme za účelem splnění právní povinnosti. Údaje potřebné k uplatnění nebo obraně právních nároků můžeme uchovávat na základě oprávněného zájmu. Bez povinných údajů nelze objednávku odeslat; adresa a poznámka jsou nepovinné.</p>

      <H2>4. Kdo může údaje obdržet</H2>
      <p>K údajům má přístup prodávající. Objednávky se ukládají u poskytovatele hostingu a databáze připojených k aplikaci (Vercel a podle nastavení Vercel KV nebo Upstash Redis). Pokud jsou zapnutá e-mailová oznámení, údaje z objednávky se předávají poskytovateli SMTP služby; oznámení prodejci se posílá na nastavenou adresu a potvrzení objednávky na e-mail kupujícího. Pokud jsou zapnutá oznámení přes Telegram, údaje z objednávky se odešlou také do nastaveného Telegram chatu. Rozsah předávaných údajů odpovídá obsahu oznámení a může zahrnovat jméno, telefon, e-mail, adresu, poznámku i obsah objednávky.</p>

      <H2>5. Uložení údajů</H2>
      <p>Objednávky jsou uloženy v databázi aplikace. Aplikace je po vyřízení automaticky nemaže; správce musí jejich potřebnost pravidelně posoudit a odstranit údaje, které už nejsou potřebné pro vyřízení objednávky, právní povinnosti nebo ochranu právních nároků. Údaje, které je nutné uchovat podle zákona, se uchovávají po dobu stanovenou příslušným předpisem.</p>
      <p>Na zařízení kupujícího aplikace ukládá do místního úložiště prohlížeče vyplněné kontaktní údaje a kopie vlastních objednávek. Tyto údaje zůstávají v prohlížeči, dokud kupující nevymaže data tohoto webu nebo dokud je aplikace nepřepíše či neodstraní.</p>

      <H2>6. Práva kupujícího</H2>
      <p>Kupující může požádat o přístup ke svým údajům, jejich opravu, výmaz nebo omezení zpracování. Může vznést námitku proti zpracování založenému na oprávněném zájmu. O přenositelnost může požádat u údajů zpracovávaných automatizovaně na základě smlouvy nebo souhlasu. Žádost lze poslat na {SELLER.email}. Výmaz se nevztahuje na údaje, které musí správce dále uchovávat podle zákona nebo které potřebuje k uplatnění či obraně právních nároků.</p>
      <p>Kupující může podat stížnost u <a href="https://uoou.gov.cz/" target="_blank" rel="noreferrer" style={{ color: "#C9A227" }}>Úřadu pro ochranu osobních údajů</a>, pokud se domnívá, že zpracování jeho údajů porušuje právní předpisy.</p>

      <H2>7. Automatizované rozhodování</H2>
      <p>Aplikace nepoužívá automatizované rozhodování ani profilování, které by pro kupujícího mělo právní nebo obdobně významné účinky.</p>
    </LegalPage>
  );
}
function ComplaintsView() {
  return (
    <LegalPage title="Reklamační řád">
      <p style={{ fontSize: 12.5, color: "#8B92A6" }}>
        Tento postup se použije podle právních předpisů a podle toho, zda prodávající při konkrétním prodeji jedná jako podnikatel. Zvláštní spotřebitelská pravidla níže platí při prodeji podnikatelem spotřebiteli.
      </p>

      <H2>1. Jak reklamaci uplatnit</H2>
      <p>Vadu nebo nesoulad karty s jejím popisem oznamte e-mailem na {SELLER.email}. Uveďte své jméno, číslo objednávky, název nebo jiné označení karty a popis vady včetně toho, kdy jste ji zjistili. Fotografie může posouzení usnadnit, její přiložení však není podmínkou pro oznámení vady. Prodávající s vámi domluví další postup a případné předání karty k posouzení.</p>

      <H2>2. Potvrzení a vyřízení reklamace</H2>
      <p>Pokud prodávající jedná jako podnikatel a kupující jako spotřebitel, prodávající potvrdí přijetí reklamace a uvede její datum, obsah a požadovaný způsob vyřízení. Reklamaci včetně odstranění vady vyřídí a spotřebitele o vyřízení informuje bez zbytečného odkladu, nejpozději do 30 dnů od uplatnění, pokud se s ním nedohodne na delší lhůtě. Marné uplynutí této lhůty zakládá spotřebiteli práva stanovená zákonem.</p>
      <p>V ostatních případech se způsob a lhůta řešení posuzují podle příslušných pravidel občanského zákoníku a konkrétní smlouvy.</p>

      <H2>3. Posouzení vady a práva kupujícího</H2>
      <p>Práva z vady se posuzují podle právního postavení stran, povahy vady, okamžiku jejího projevení a informací, které byly kupujícímu sděleny před uzavřením smlouvy. Při spotřebitelském prodeji se uplatní zákonná práva z vadného plnění. U soukromého prodeje se použijí příslušná pravidla občanského zákoníku pro daný vztah.</p>

      <H2>4. Stav sběratelských karet</H2>
      <p>Stav „Mint“, „Near Mint“, „Excellent“ nebo „Použitá“ a konkrétní popis či fotografie pomáhají vymezit vlastnosti nabízené karty. Opotřebení nebo vada, která byla před koupí konkrétně a srozumitelně popsána a zohledněna v nabídce, se posuzuje s ohledem na tento popis. Samotné označení stavu však nevylučuje práva z jiné, nepopsané vady ani práva, která nelze smluvně omezit.</p>

      <H2>5. Mimosoudní řešení spotřebitelských sporů</H2>
      <p>Pokud spor vznikne mezi spotřebitelem a prodávajícím, který při prodeji jedná jako podnikatel, a nepodaří se jej vyřešit přímo, může spotřebitel podat návrh na mimosoudní řešení sporu u České obchodní inspekce. Informace jsou na <a href="https://coi.gov.cz/informace-o-adr/" target="_blank" rel="noreferrer" style={{ color: "#C9A227" }}>coi.gov.cz/informace-o-adr</a>.</p>
    </LegalPage>
  );
}
