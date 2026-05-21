"use client";

import { SESSION_EXPIRED_MESSAGE } from "@/lib/auth";

type Props = {
  show: boolean;
};

export function SessionExpiredBanner({ show }: Props) {
  if (!show) return null;

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
    >
      <p>{SESSION_EXPIRED_MESSAGE}</p>
    </div>
  );
}
