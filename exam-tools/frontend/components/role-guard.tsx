"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  clearAuth,
  dashboardPathForRole,
  getMe,
  getStoredToken,
  type ApiRole,
} from "@/lib/auth";

type Props = {
  expectedRole: ApiRole;
  loginHref: string;
  children: React.ReactNode;
};

export function RoleGuard({ expectedRole, loginHref, children }: Props) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = getStoredToken();
      if (!token) {
        router.replace(loginHref);
        return;
      }
      try {
        const me = await getMe();
        if (cancelled) return;
        if (me.role !== expectedRole) {
          router.replace(dashboardPathForRole(me.role));
          return;
        }
        setReady(true);
      } catch {
        if (cancelled) return;
        clearAuth();
        router.replace(loginHref);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [expectedRole, loginHref, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-base text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
