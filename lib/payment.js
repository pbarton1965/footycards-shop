// Česká QR platba (standard SPD) — čtou ji aplikace všech českých bank.

// "19-2000145399/0800" nebo "2000145399/0800" -> IBAN, nebo null při neplatném formátu
export function czAccountToIban(account) {
  const m = String(account || "").replace(/\s/g, "").match(/^(?:(\d{1,6})-)?(\d{2,10})\/(\d{4})$/);
  if (!m) return null;
  const prefix = (m[1] || "").padStart(6, "0");
  const number = m[2].padStart(10, "0");
  const bank = m[3];
  const bban = bank + prefix + number;
  // kontrolní číslice IBAN: 98 - (bban + "CZ00" jako čísla) mod 97
  const numeric = bban + "123500"; // C=12, Z=35, 00
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  const check = String(98 - rem).padStart(2, "0");
  return `CZ${check}${bban}`;
}

const clean = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9 .,\-/]/g, "").slice(0, 60);

// vrací řetězec pro QR kód, nebo null když chybí platné číslo účtu
export function buildSpd({ account, amount, vs, message }) {
  const iban = czAccountToIban(account);
  if (!iban || !(amount > 0)) return null;
  const parts = ["SPD*1.0", `ACC:${iban}`, `AM:${amount.toFixed(2)}`, "CC:CZK"];
  if (vs) parts.push(`X-VS:${String(vs).replace(/\D/g, "").slice(-10)}`);
  if (message) parts.push(`MSG:${clean(message)}`);
  return parts.join("*");
}
