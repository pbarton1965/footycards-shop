import { createHash, timingSafeEqual } from "node:crypto";
import { redis } from "./redis.js";

export const ip = (req) =>
  String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();

const sha = (s) => createHash("sha256").update(String(s)).digest();

export function passwordMatches(given) {
  const real = process.env.ADMIN_PASSWORD;
  if (!real || !given) return false;
  return timingSafeEqual(sha(given), sha(real));
}

// Vrací true, pokud je požadavek od správce. Po 10 špatných pokusech za 15 min blokuje IP.
export async function isAdmin(req) {
  const given = req.headers["x-admin-password"];
  if (!given) return false;
  const key = `fail:${ip(req)}`;
  const fails = Number((await redis("GET", key)) || 0);
  if (fails >= 10) return false;
  if (passwordMatches(given)) return true;
  await redis("INCR", key);
  await redis("EXPIRE", key, 900);
  return false;
}

// Jednoduchý limit počtu požadavků z jedné IP
export async function rateLimited(req, name, max, seconds) {
  const key = `rl:${name}:${ip(req)}`;
  const n = await redis("INCR", key);
  if (n === 1) await redis("EXPIRE", key, seconds);
  return n > max;
}
