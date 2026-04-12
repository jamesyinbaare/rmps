"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { StaffDashboardOverview } from "@/components/staff-dashboard-overview";
import { getMe, type UserMe } from "@/lib/auth";

export default function AdminMonitoringPage() {
  const router = useRouter();
  const [me, setMe] = useState<UserMe | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getMe();
        if (cancelled) return;
        setMe(user);
        if (user.role !== "SUPER_ADMIN" && user.role !== "TEST_ADMIN_OFFICER") {
          router.replace("/");
        }
      } catch {
        if (!cancelled) setMe(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (me && me.role !== "SUPER_ADMIN" && me.role !== "TEST_ADMIN_OFFICER") {
    return null;
  }

  return (
    <div className="space-y-6">

      <StaffDashboardOverview variant="national" />
    </div>
  );
}
