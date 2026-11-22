export function formatGhs(amount: number | string | undefined | null): string {
  const n = Number(amount || 0);
  return `GHS ${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export const TYPE_FILTERS = [
  { value: "payable", label: "Payable" },
  { value: "fee_paying", label: "Fee-paying" },
  { value: "referral", label: "Referral" },
  { value: "private", label: "Private" },
] as const;

export function canPayInvoice(status: string, amount: number): boolean {
  return (
    status !== "draft" &&
    status !== "paid" &&
    status !== "cancelled" &&
    amount > 0
  );
}
