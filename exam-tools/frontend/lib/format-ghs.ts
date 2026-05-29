/** Format GHS amounts from API (Decimal serializes as string). */
export function formatGhsAmount(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  const n = Number.parseFloat(String(value));
  if (Number.isNaN(n)) return "—";
  return n.toFixed(2);
}
