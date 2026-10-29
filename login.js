// /api/login — ověření hesla správce (heslo se posílá v hlavičce x-admin-password)
import { dbConfigured } from "../lib/redis.js";
import { isAdmin } from "../lib/auth.js";
import { fail } from "../lib/util.js";

export default async function handler(req, res) {
  if (!process.env.ADMIN_PASSWORD) return fail(res, 503, "admin_not_configured", "Chybí proměnná ADMIN_PASSWORD.");
  if (!dbConfigured()) return fail(res, 503, "db_not_configured", "Databáze není připojená.");
  try {
    if (await isAdmin(req)) return res.status(200).json({ ok: true });
    return fail(res, 401, "unauthorized", "Nesprávné heslo.");
  } catch (e) {
    return fail(res, 500, "server_error", String(e.message || e));
  }
}
