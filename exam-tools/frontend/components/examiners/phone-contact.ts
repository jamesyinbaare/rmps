/** Strip spaces for tel: / sms: URIs. */
export function normalizePhoneForTel(phone: string | null | undefined): string | null {
  const trimmed = phone?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\s/g, "");
}
