import { DEFAULT_PAGE_SIZE, MAX_CUSTOM_PAGE_SIZE } from "@/components/examiner-invitations/constants";

export function clampPageSize(n: number): number {
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_CUSTOM_PAGE_SIZE);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function formatDateOnly(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function datetimeLocalToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function dateInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Messages with this token are coordination notices — only accepted invitees should receive them. */
export function isCoordinationSmsMessage(message: string): boolean {
  return message.includes("{coordination_date}");
}

/** Invitees must have accepted the invitation before coordination SMS is sent. */
export function canReceiveCoordinationSms(status: string): boolean {
  return status === "accepted";
}

/** When non-accepted invitees are in the selection, coordination SMS must not be sent at all. */
export function coordinationSmsSelectionBlockedReason(
  rows: ReadonlyArray<{ status: string }>,
  message: string,
): string | null {
  if (!isCoordinationSmsMessage(message)) return null;
  const blockedCount = rows.filter((row) => !canReceiveCoordinationSms(row.status)).length;
  if (blockedCount === 0) return null;
  if (blockedCount === rows.length) {
    return (
      "None of the people you selected have accepted their invitation yet. " +
      "You can send a coordination message once they accept."
    );
  }
  if (blockedCount === 1) {
    return (
      "1 person in your selection hasn't accepted their invitation yet. " +
      "Deselect them first, or wait until they accept."
    );
  }
  return (
    `${blockedCount} people in your selection haven't accepted their invitation yet. ` +
    "Deselect them first, or wait until they accept."
  );
}

export function humanizeRegion(region: string): string {
  return region.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function matchesSearchQuery(name: string, phone: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return name.toLowerCase().includes(q) || phone.toLowerCase().includes(q);
}
