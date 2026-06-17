"use client";

import { normalizePhoneForTel } from "@/components/examiners/phone-contact";

export function PhoneLink({
  phone,
  className,
}: {
  phone: string | null | undefined;
  className?: string;
}) {
  const normalized = normalizePhoneForTel(phone);
  const display = phone?.trim() || "—";
  if (!normalized) {
    return <span className={className}>{display}</span>;
  }
  return (
    <a href={`tel:${normalized}`} className={className} onClick={(e) => e.stopPropagation()}>
      {display}
    </a>
  );
}
