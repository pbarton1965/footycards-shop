// /api/order  POST (veřejné) — vytvoří objednávku, atomicky odečte sklad, pošle oznámení
import { redis, dbConfigured } from "../lib/redis.js";
import { rateLimited } from "../lib/auth.js";
import { notifyAll } from "../lib/notify.js";
import { buildSpd, czAccountToIban } from "../lib/payment.js";
import { str, int, CZK, fail } from "../lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed");
  if (!dbConfigured()) return fail(res, 503, "db_not_configured", "Obchod je dočasně nedostupný.");

  const b = req.body || {};
  const buyer = {
    name: str(b.buyer?.name, 100),
    phone: str(b.buyer?.phone, 40),
    email: str(b.buyer?.email, 100),
    address: str(b.buyer?.address, 200),
    note: str(b.buyer?.note, 500),
  };
  if (!buyer.name || buyer.phone.length < 3) return fail(res, 400, "invalid_buyer", "Vyplň jméno a telefon.");
  if (b.consent !== true) return fail(res, 400, "no_consent", "Je potřeba souhlas s podmínkami.");
  if (!Array.isArray(b.items) || b.items.length < 1 || b.items.length > 30)
    return fail(res, 400, "invalid_items", "Košík je prázdný.");

  // sloučení duplicit a kontrola množství
  const wanted = new Map();
  for (const it of b.items) {
    const qty = int(it?.qty, 1, 99);
    if (typeof it?.id !== "string" || !/^[a-z0-9]{6,32}$/i.test(it.id) || qty === null)
      return fail(res, 400, "invalid_items", "Neplatná položka v košíku.");
    wanted.set(it.id, (wanted.get(it.id) || 0) + qty);
  }

  const taken = []; // pro případný návrat na sklad
  const rollback = async () => { for (const [id, qty] of taken) await redis("HINCRBY", "stock", id, qty); };

  try {
    if (await rateLimited(req, "order", 5, 3600))
      return fail(res, 429, "rate_limited", "Příliš mnoho objednávek, zkus to později.");

    const ids = [...wanted.keys()];
    const raws = await redis("HMGET", "cards", ...ids);
    const cards = raws.map((r) => (r ? JSON.parse(r) : null));
    const missing = cards.findIndex((c) => !c);
    if (missing !== -1) return fail(res, 409, "card_missing", "Některá karta už v nabídce není. Obnov stránku.");

    for (let i = 0; i < ids.length; i++) {
      const left = await redis("HINCRBY", "stock", ids[i], -wanted.get(ids[i]));
      taken.push([ids[i], wanted.get(ids[i])]);
      if (left < 0) {
        await rollback();
        return fail(res, 409, "out_of_stock", `„${cards[i].name}“ už není skladem v požadovaném množství.`);
      }
    }

    const items = cards.map((c) => ({ id: c.id, name: c.name, qty: wanted.get(c.id), price: c.price }));
    const total = items.reduce((s, i) => s + i.price * i.qty, 0);
    const vs = String(100000 + Number(await redis("INCR", "order_seq")));
    const date = new Date().toISOString();

    const account = process.env.PAYMENT_ACCOUNT || "";
    const spd = buildSpd({ account, amount: total, vs, message: `FootyCardscz objednavka ${vs}` });
    const payment = spd ? { account, iban: czAccountToIban(account), amount: total, vs, spd } : null;

    const order = { id: vs, date, items, total, buyer, payment, notify: {} };
    await redis("HSET", "orders", vs, JSON.stringify(order));

    const subject = `Nová objednávka #${vs}`;
    const lines = [
      "Údaje kupujícího:",
      `Jméno: ${buyer.name}`,
      `Telefon: ${buyer.phone}`,
      buyer.email ? `E-mail: ${buyer.email}` : null,
      buyer.address ? `Adresa: ${buyer.address}` : null,
      buyer.note ? `Poznámka: ${buyer.note}` : null,
      "",
      "Karty:",
      ...items.map((i) => `- ${i.qty}× ${i.name} — ${CZK(i.price * i.qty)}`),
      "",
      `Celkem: ${CZK(total)}`,
      payment ? `Platba QR kódem, variabilní symbol: ${vs}` : "Platbu domluv s kupujícím.",
    ].filter((l) => l !== null);
    const notify = await notifyAll(subject, lines.join("\n"));
    order.notify = { telegram: Boolean(notify.telegram.ok), email: Boolean(notify.email.ok) };
    await redis("HSET", "orders", vs, JSON.stringify(order));

    return res.status(200).json({ ok: true, order });
  } catch (e) {
    await rollback().catch(() => {});
    return fail(res, 500, "server_error", "Objednávku se nepodařilo uložit, zkus to znovu.");
  }
}
