export const CONDITIONS = ["Mint", "Near Mint", "Excellent", "Použitá"];

// odstraní řídicí znaky a ořízne na max délku
export const str = (v, max) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "";

export const int = (v, min, max) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export const CZK = (n) => Number(n).toLocaleString("cs-CZ") + " Kč";

export function fail(res, code, error, message) {
  res.status(code).json({ ok: false, error, message: message || error });
}
