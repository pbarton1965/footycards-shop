// /api/image?id=...[&side=back]  — obrázek karty (uložený v databázi jako JPEG dataURL)
// Parametr v=... slouží jen k obnovení mezipaměti po výměně obrázku, server ho ignoruje.
import { redis, dbConfigured } from "../lib/redis.js";

export default async function handler(req, res) {
  const id = req.query?.id;
  if (!dbConfigured() || typeof id !== "string" || !/^[a-z0-9]{6,32}$/i.test(id)) {
    res.status(404).end();
    return;
  }
  try {
    const key = req.query?.side === "back" ? `img2:${id}` : `img:${id}`;
    const data = await redis("GET", key);
    const m = typeof data === "string" && data.match(/^data:image\/jpeg;base64,(.+)$/);
    if (!m) { res.status(404).end(); return; }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.status(200).send(Buffer.from(m[1], "base64"));
  } catch {
    res.status(500).end();
  }
}
