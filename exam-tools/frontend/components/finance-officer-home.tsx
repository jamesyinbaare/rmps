"use client";

import { useEffect, useState } from "react";

import { getMe, type UserMe } from "@/lib/auth";

export function FinanceOfficerHome() {
  const [me, setMe] = useState<UserMe | null>(null);

  useEffect(() => {
    getMe()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  return (
    <p className="max-w-lg text-sm leading-relaxed text-muted-foreground">
      {me?.full_name ? <>Welcome, {me.full_name}. </> : null}
      Use the menu on the left to get started.
    </p>
  );
}
