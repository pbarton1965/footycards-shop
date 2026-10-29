// /api/cards  GET (veřejné) | POST, PATCH, DELETE (jen správce)
// Karta má až dvě strany: přední (image) a zadní (imageBack), obě jako JPEG dataURL.
import { randomUUID } from "node:crypto";
import { redis, hgetall, dbConfigured } from "../lib/redis.js";
import { isAdmin } from "../lib/auth.js";
import { CONDITIONS, str, int, fail } from "../lib/util.js";

const IMG_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
const MAX_IMG = 450_000; // znaků dataURL na jednu stranu (~330 kB)

// vrací: null = žádný obrázek, false = neplatný, jinak platný dataURL
function readImage(v) {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v !== "string" || v.length > MAX_IMG || !IMG_RE.test(v)) return false;
  return v;
}

export default async function handler(req, res) {
  if (!dbConfigured()) return fail(res, 503, "db_not_configured", "Databáze není připojená.");
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method === "GET") {
      const [cardsRaw, stock] = await Promise.all([hgetall("cards"), hgetall("stock")]);
      const admin = await isAdmin(req);
      let cards = Object.values(cardsRaw)
        .map((s) => JSON.parse(s))
        .map((c) => ({ ...c, qty: Number(stock[c.id] ?? 0) }));
      if (!admin) cards = cards.filter((c) => c.qty > 0);
      cards.sort((a, b) => (b.created || 0) - (a.created || 0));
      return res.status(200).json({ ok: true, cards, admin });
    }

    if (!(await isAdmin(req))) return fail(res, 401, "unauthorized", "Nesprávné heslo správce.");

    if (req.method === "POST") {
      const b = req.body || {};
      const name = str(b.name, 120);
      const description = str(b.description, 600);
      const price = int(b.price, 1, 1_000_000);
      const qty = int(b.qty, 0, 9999);
      if (!name || price === null || qty === null || !CONDITIONS.includes(b.condition))
        return fail(res, 400, "invalid", "Vyplň název, cenu, počet kusů a stav.");
      const front = readImage(b.image);
      const back = readImage(b.imageBack);
      if (front === false || back === false)
        return fail(res, 400, "invalid_image", "Obrázek musí být JPEG do cca 330 kB (v appce se zmenší sám).");
      if (back && !front) return fail(res, 400, "invalid_image", "Zadní strana vyžaduje i přední stranu.");
      const id = randomUUID().replace(/-/g, "").slice(0, 10);
      const now = Date.now();
      const card = {
        id, name, description, condition: b.condition, price,
        hasImage: Boolean(front), hasBack: Boolean(back), imgv: now, created: now,
      };
      await redis("HSET", "cards", id, JSON.stringify(card));
      await redis("HSET", "stock", id, qty);
      if (front) await redis("SET", `img:${id}`, front);
      if (back) await redis("SET", `img2:${id}`, back);
      return res.status(200).json({ ok: true, card: { ...card, qty } });
    }

    if (req.method === "PATCH") {
      const b = req.body || {};
      const raw = typeof b.id === "string" ? await redis("HGET", "cards", b.id) : null;
      if (!raw) return fail(res, 404, "not_found", "Karta neexistuje.");
      const card = JSON.parse(raw);

      // nejdřív vše zkontrolujeme, teprve potom cokoli zapíšeme
      if (b.name !== undefined) { const v = str(b.name, 120); if (!v) return fail(res, 400, "invalid", "Prázdný název."); card.name = v; }
      if (b.description !== undefined) card.description = str(b.description, 600);
      if (b.price !== undefined) { const v = int(b.price, 1, 1_000_000); if (v === null) return fail(res, 400, "invalid", "Neplatná cena."); card.price = v; }
      let qty;
      if (b.qty !== undefined) { qty = int(b.qty, 0, 9999); if (qty === null) return fail(res, 400, "invalid", "Neplatný počet kusů."); }

      // obrázky: řetězec = nahradit, null = odebrat, nezadáno = nechat
      const writes = [];
      for (const [field, key, flag] of [["image", `img:${card.id}`, "hasImage"], ["imageBack", `img2:${card.id}`, "hasBack"]]) {
        if (b[field] === undefined) continue;
        if (b[field] === null) { writes.push(["DEL", key]); card[flag] = false; }
        else {
          const v = readImage(b[field]);
          if (!v) return fail(res, 400, "invalid_image", "Obrázek musí být JPEG do cca 330 kB.");
          writes.push(["SET", key, v]); card[flag] = true;
        }
        card.imgv = Date.now(); // změní adresu obrázku, aby se neukazovala stará verze z mezipaměti
      }
      if (card.hasBack && !card.hasImage) return fail(res, 400, "invalid_image", "Zadní strana vyžaduje i přední stranu.");

      for (const w of writes) await redis(...w);
      await redis("HSET", "cards", card.id, JSON.stringify(card));
      if (qty !== undefined) await redis("HSET", "stock", card.id, qty);
      return res.status(200).json({ ok: true, card });
    }

    if (req.method === "DELETE") {
      const id = req.query?.id;
      if (typeof id !== "string" || !/^[a-z0-9]{6,32}$/i.test(id)) return fail(res, 400, "invalid", "Neplatné ID.");
      await redis("HDEL", "cards", id);
      await redis("HDEL", "stock", id);
      await redis("DEL", `img:${id}`);
      await redis("DEL", `img2:${id}`);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, "method_not_allowed");
  } catch (e) {
    return fail(res, 500, "server_error", String(e.message || e));
  }
}
