// Oznámení o nové objednávce: Telegram a/nebo e-mail (Resend). Každý kanál je nezávislý.
export async function sendTelegram(subject, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { attempted: false };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: `📦 ${subject}\n\n${body}`.slice(0, 4000) }),
    });
    const data = await r.json();
    return data.ok ? { attempted: true, ok: true } : { attempted: true, ok: false, error: data.description };
  } catch (e) {
    return { attempted: true, ok: false, error: String(e) };
  }
}

export async function sendEmail(subject, body) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.SHOP_EMAIL;
  if (!apiKey || !to) return { attempted: false };
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "FootyCardscz <onboarding@resend.dev>", to: [to], subject, text: body }),
    });
    return r.ok ? { attempted: true, ok: true } : { attempted: true, ok: false, error: await r.text() };
  } catch (e) {
    return { attempted: true, ok: false, error: String(e) };
  }
}

export async function notifyAll(subject, body) {
  const [telegram, email] = await Promise.all([sendTelegram(subject, body), sendEmail(subject, body)]);
  return { telegram, email };
}
