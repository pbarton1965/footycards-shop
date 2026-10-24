// /api/image?id=...  — obrázek karty (uložený v databázi jako JPEG dataURL)
import { redis, dbConfigured } from "../lib/redis.js";

export default async function handler(req, res) {
  const id = req.query?.id;
  if (!dbConfigured() || typeof id !== "string" || !/^[a-z0-9]{6,32}$/i.test(id)) {
    res.status(404).end();
    return;
  }
  try {
    const data = await redis("GET", `img:${id}`);
    const m = typeof data === "string" && data.match(/^data:image\/jpeg;base64,(.+)$/);
    if (!m) { res.status(404).end(); return; }
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.status(200).send(Buffer.from(m[1], "base64"));
  } catch {
    res.status(500).end();
  }
}
