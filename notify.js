// Oznámení o nové objednávce: Telegram a/nebo e-mail (Resend). Každý kanál je nezávislý.
import { envClean, telegramToken, telegramChatId } from "./env.js";

const mask = (text, secret) => (secret ? String(text).split(secret).join("***") : String(text));

// Srozumitelné vysvětlení nejčastějších chyb Telegramu
export function telegramHint(description = "", code) {
  const d = String(description).toLowerCase();
  if (d.includes("chat not found"))
    return "Telegram nenašel chat s tímto ID. Zkontroluj TELEGRAM_CHAT_ID (tvoje číslo od @userinfobot) a v Telegramu otevři bota a klikni Start.";
  if (d.includes("bots can't send messages to bots"))
    return "Jako chat ID je zadané ID bota. Potřebuješ svoje vlastní číslo od @userinfobot.";
  if (d.includes("can't initiate conversation") || d.includes("blocked by the user") || d.includes("user is deactivated"))
    return "Otevři bota v Telegramu a klikni Start (nebo ho odblokuj).";
  if (code === 401 || d.includes("unauthorized"))
    return "Telegram odmítl token. V @BotFather (/mybots → bot → API Token) zkopíruj aktuální token a ve Vercelu ho přepiš.";
  if (code === 404 || d === "not found")
    return "Token má špatný tvar nebo patří neexistujícímu botu. Zkopíruj ho znovu z @BotFather.";
  if (code === 429) return "Telegram omezil počet zpráv, zkus to za chvíli.";
  return `Telegram vrátil chybu: ${description || "neznámá"}`;
}

export async function telegramBotInfo() {
  const token = telegramToken();
  if (!token) return { ok: false, error: "Chybí token" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = await r.json();
    return data.ok
      ? { ok: true, username: data.result?.username }
      : { ok: false, code: data.error_code, error: data.description };
  } catch (e) {
    return { ok: false, error: mask(e?.message || e, token) };
  }
}

export async function sendTelegram(subject, body) {
  const token = telegramToken();
  const chatId = telegramChatId();
  if (!token || !chatId) return { attempted: false };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `📦 ${subject}\n\n${body}`.slice(0, 4000) }),
    });
    const data = await r.json();
    if (data.ok) return { attempted: true, ok: true };
    console.error("Telegram odmítl zprávu:", data.error_code, data.description);
    return { attempted: true, ok: false, error: data.description, hint: telegramHint(data.description, data.error_code) };
  } catch (e) {
    const msg = mask(e?.message || e, token);
    console.error("Telegram – chyba spojení:", msg);
    return { attempted: true, ok: false, error: msg, hint: `Nepodařilo se spojit s Telegramem: ${msg}` };
  }
}

export async function sendEmail(subject, body) {
  const apiKey = envClean("RESEND_API_KEY");
  const to = envClean("SHOP_EMAIL");
  if (!apiKey || !to) return { attempted: false };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "FootyCardscz <onboarding@resend.dev>", to: [to], subject, text: body }),
    });
    if (r.ok) return { attempted: true, ok: true };
    const text = mask(await r.text(), apiKey);
    console.error("Resend odmítl e-mail:", r.status, text);
    const hint = r.status === 403
      ? "Resend bez ověřené domény posílá jen na adresu, kterou ses do Resendu registroval. SHOP_EMAIL musí být tatáž adresa."
      : `Resend vrátil chybu ${r.status}.`;
    return { attempted: true, ok: false, error: text, hint };
  } catch (e) {
    const msg = mask(e?.message || e, apiKey);
    return { attempted: true, ok: false, error: msg, hint: `Nepodařilo se spojit s Resendem: ${msg}` };
  }
}

export async function notifyAll(subject, body) {
  const [telegram, email] = await Promise.all([sendTelegram(subject, body), sendEmail(subject, body)]);
  return { telegram, email };
}
