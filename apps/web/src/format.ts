/**
 * Display formatting that works on the engine's decimal strings directly,
 * so a value is never pushed through floating point before it is shown.
 */

/** "1234567.8" → "1,234,567.8". Keeps the decimals exactly as given. */
export function groupDigits(value: string): string {
  const negative = value.startsWith("-");
  const [int = "0", frac] = (negative ? value.slice(1) : value).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${frac !== undefined ? `.${frac}` : ""}`;
}

const SYMBOLS: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", GHS: "GH₵", NGN: "₦", KES: "KSh" };

export function currencySymbol(code: string): string {
  return SYMBOLS[code] ?? `${code} `;
}

export function money(value: string, currency?: string): string {
  return `${currency ? currencySymbol(currency) : ""}${groupDigits(value)}`;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "2054-07-01" → "1 Jul 2054". */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

/** 169 → "14 years 1 month". */
export function termText(months: number): string {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years} year${years === 1 ? "" : "s"}`);
  if (rest) parts.push(`${rest} month${rest === 1 ? "" : "s"}`);
  return parts.join(" ") || "0 months";
}
