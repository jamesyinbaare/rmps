"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { StaffDashboardOverview } from "@/components/staff-dashboard-overview";
import { getMe, type UserMe } from "@/lib/auth";
import { canAccessMonitoring } from "@/lib/monitoring-access";

function AdminMonitoringContent() {
  const router = useRouter();
  const [me, setMe] = useState<UserMe | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await getMe();
        if (cancelled) return;
        setMe(user);
        if (!canAccessMonitoring(user.role)) {
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

  if (me && !canAccessMonitoring(me.role)) {
    return null;
  }

  return (
    <StaffDashboardOverview variant="national" mobileFirst examIdSearchParam="exam_id" />
  );
}

export default function AdminMonitoringPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
      <AdminMonitoringContent />
    </Suspense>
  );
}
