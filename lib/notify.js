import nodemailer from "nodemailer";

export async function sendTelegram(subject, body) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { attempted: false };

  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: `📦 ${subject}\n\n${body}`.slice(0, 4000),
      }),
    });
    const data = await r.json();
    return data.ok
      ? { attempted: true, ok: true }
      : { attempted: true, ok: false, error: data.description };
  } catch (e) {
    return { attempted: true, ok: false, error: String(e) };
  }
}

async function sendEmailTo(to, subject, body) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass || !to) {
    return { attempted: false };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass: pass.replace(/\s+/g, ""),
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || user,
      to,
      subject,
      text: body,
    });

    return { attempted: true, ok: true };
  } catch (e) { 
    console.error("SMTP EMAIL ERROR:", e);
    return { attempted: true, ok: false, error: String(e) };
  }
}

export async function sendEmail(subject, body) {
  return sendEmailTo(process.env.SHOP_EMAIL, subject, body);
}

export async function sendCustomerEmail(to, subject, body) {
  return sendEmailTo(to, subject, body);
}

export async function notifyAll(subject, body) {
  const [telegram, email] = await Promise.all([
    sendTelegram(subject, body),
    sendEmail(subject, body),
  ]);
  return { telegram, email };
}
