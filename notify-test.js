// /api/notify-test  POST (jen správce) — zkontroluje nastavení oznámení a pošle zkušební zprávu.
// Ukáže přesně, co je špatně (chybí proměnná, špatný token, špatné chat ID…). Hodnoty tajných údajů nikdy nevrací.
import { dbConfigured } from "../lib/redis.js";
import { isAdmin } from "../lib/auth.js";
import { sendTelegram, sendEmail, telegramBotInfo, telegramHint } from "../lib/notify.js";
import { envClean, telegramToken, telegramChatId } from "../lib/env.js";
import { fail } from "../lib/util.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed");
  if (!dbConfigured()) return fail(res, 503, "db_not_configured", "Databáze není připojená.");
  try {
    if (!(await isAdmin(req))) return fail(res, 401, "unauthorized", "Nesprávné heslo správce.");

    const tg = [];
    const add = (list, ok, text) => list.push({ ok, text });
    const token = telegramToken();
    const chat = telegramChatId();

    add(tg, Boolean(token), token ? "Proměnná TELEGRAM_BOT_TOKEN je nastavená." : "Chybí proměnná TELEGRAM_BOT_TOKEN ve Vercelu (po přidání je potřeba Redeploy).");
    add(tg, Boolean(chat), chat ? "Proměnná TELEGRAM_CHAT_ID je nastavená." : "Chybí proměnná TELEGRAM_CHAT_ID ve Vercelu (po přidání je potřeba Redeploy).");

    const tokenOk = /^\d{6,}:[A-Za-z0-9_-]{30,}$/.test(token);
    const chatOk = /^-?\d+$/.test(chat);
    if (token) {
      add(tg, tokenOk, tokenOk ? "Token má správný tvar." : "Token má špatný tvar. Musí vypadat jako 123456789:AAE… (čísla, dvojtečka, písmena).");
      if (tokenOk) {
        const info = await telegramBotInfo();
        add(tg, info.ok, info.ok ? `Token patří botu @${info.username}.` : telegramHint(info.error, info.code));
      }
    }
    if (chat) {
      add(tg, chatOk, chatOk ? "Chat ID je číslo." : "Chat ID musí být číslo (např. 123456789), ne jméno bota ani odkaz.");
    }
    let tgOk = false;
    if (token && chat && tokenOk && chatOk) {
      const r = await sendTelegram("Test oznámení", "Pokud tohle čteš, oznámení o objednávkách funguje.");
      tgOk = Boolean(r.ok);
      add(tg, tgOk, tgOk ? "Zkušební zpráva odeslána. Podívej se do Telegramu." : r.hint || "Zprávu se nepodařilo odeslat.");
    }

    const em = [];
    let emOk = null;
    if (!envClean("RESEND_API_KEY") || !envClean("SHOP_EMAIL")) {
      add(em, null, "E-mail není nastavený (je to volitelné, stačí Telegram).");
    } else {
      const r = await sendEmail("Test oznámení", "Pokud tohle čteš, e-mailová oznámení fungují.");
      emOk = Boolean(r.ok);
      add(em, emOk, emOk ? "Zkušební e-mail odeslán." : r.hint || "E-mail se nepodařilo odeslat.");
    }

    return res.status(200).json({ ok: true, telegram: { ok: tgOk, report: tg }, email: { ok: emOk, report: em } });
  } catch (e) {
    return fail(res, 500, "server_error", String(e.message || e));
  }
}
