/** Shared labels/styles for registration completeness statuses. */

export type RegistrationStatusValue = "DRAFT" | "INCOMPLETE" | "COMPLETE";

export function registrationStatusLabel(status: string | null | undefined): string {
  switch ((status || "").toUpperCase()) {
    case "COMPLETE":
      return "Complete";
    case "INCOMPLETE":
      return "Incomplete";
    case "DRAFT":
      return "Draft";
    default:
      return status || "Unknown";
  }
}

export function registrationStatusBadgeClass(status: string | null | undefined): string {
  switch ((status || "").toUpperCase()) {
    case "COMPLETE":
      return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
    case "INCOMPLETE":
      return "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200";
    case "DRAFT":
      return "bg-muted text-muted-foreground";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function feePaymentStatusLabel(status: string | null | undefined): string {
  switch ((status || "").toLowerCase()) {
    case "not_required":
      return "Not required";
    case "paid":
      return "Paid";
    case "waived":
      return "Waived";
    case "unpaid":
      return "Unpaid";
    default:
      return status || "Unknown";
  }
}
