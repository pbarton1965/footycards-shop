// Minimální klient pro Upstash Redis přes REST (bez závislostí).
// Proměnné nastaví Vercel sám po propojení databáze (Storage -> Upstash for Redis).
const URL_ = () => process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = () => process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

export function dbConfigured() {
  return Boolean(URL_() && TOKEN());
}

export async function redis(...cmd) {
  const r = await fetch(URL_(), {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN()}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd.map(String)),
  });
  const data = await r.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

// HGETALL vrací plochý seznam [pole, hodnota, ...] -> objekt
export async function hgetall(key) {
  const res = await redis("HGETALL", key);
  if (!res) return {};
  if (!Array.isArray(res)) return res;
  const out = {};
  for (let i = 0; i < res.length; i += 2) out[res[i]] = res[i + 1];
  return out;
}
