// Hodnoty proměnných ve Vercelu někdo vloží s uvozovkami, mezerou nebo koncem řádku.
// Takový token Telegram odmítne (404/401), proto ho tady očistíme.
export function envClean(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  return raw.replace(/\s+/g, "").replace(/^["'“”‘’`]+|["'“”‘’`]+$/g, "");
}

export function telegramToken() {
  let t = envClean("TELEGRAM_BOT_TOKEN");
  if (/^bot\d+:/i.test(t)) t = t.slice(3); // někdo zkopíroval i slovo "bot" z adresy
  return t;
}

export const telegramChatId = () => envClean("TELEGRAM_CHAT_ID");
