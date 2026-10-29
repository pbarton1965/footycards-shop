// /api/orders  GET (seznam všech objednávek) | DELETE ?id= (zrušení + návrat na sklad) — jen správce
import { redis, hgetall, dbConfigured } from "../lib/redis.js";
import { isAdmin } from "../lib/auth.js";
import { fail } from "../lib/util.js";

export default async function handler(req, res) {
  if (!dbConfigured()) return fail(res, 503, "db_not_configured", "Databáze není připojená.");
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!(await isAdmin(req))) return fail(res, 401, "unauthorized", "Nesprávné heslo správce.");

    if (req.method === "GET") {
      const raw = await hgetall("orders");
      const orders = Object.values(raw).map((s) => JSON.parse(s)).sort((a, b) => (b.date > a.date ? 1 : -1));
      return res.status(200).json({ ok: true, orders });
    }

    if (req.method === "DELETE") {
      const id = req.query?.id;
      const raw = typeof id === "string" ? await redis("HGET", "orders", id) : null;
      if (!raw) return fail(res, 404, "not_found", "Objednávka neexistuje.");
      const order = JSON.parse(raw);
      for (const it of order.items) {
        // vrátit na sklad jen u karet, které ještě existují
        if ((await redis("HGET", "stock", it.id)) !== null) await redis("HINCRBY", "stock", it.id, it.qty);
      }
      await redis("HDEL", "orders", id);
      return res.status(200).json({ ok: true });
    }

    return fail(res, 405, "method_not_allowed");
  } catch (e) {
    return fail(res, 500, "server_error", String(e.message || e));
  }
}
