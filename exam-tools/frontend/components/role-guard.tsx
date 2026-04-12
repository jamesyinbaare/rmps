"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import {
  clearAuth,
  dashboardPathForRole,
  getMe,
  getStoredToken,
  type ApiRole,
} from "@/lib/auth";

type BaseProps = {
  loginHref: string;
  children: React.ReactNode;
};

type Props =
  | (BaseProps & { expectedRole: ApiRole; allowedRoles?: undefined })
  | (BaseProps & { expectedRole?: undefined; allowedRoles: ApiRole[] });

export function RoleGuard(props: Props) {
  const { loginHref, children } = props;
  const router = useRouter();
  const [ready, setReady] = useState(false);

  const allowedJoin =
    "allowedRoles" in props && props.allowedRoles != null
      ? props.allowedRoles.join("|")
      : "";
  const singleExpected = "expectedRole" in props ? props.expectedRole : undefined;

  const allowedList: ApiRole[] = useMemo((): ApiRole[] => {
    if (allowedJoin.length > 0) {
      return allowedJoin.split("|") as ApiRole[];
    }
    if (singleExpected !== undefined) {
      return [singleExpected];
    }
    return [];
  }, [allowedJoin, singleExpected]);

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
        if (!allowedList.includes(me.role)) {
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
  }, [allowedList, loginHref, router]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <p className="text-base text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return <>{children}</>;
}
