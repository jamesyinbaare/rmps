"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";

/** Leaderboard retired — resolutions live on Operations. */
export default function ClerkStatsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/clerk/manage");
  }, [router]);

  return (
    <DashboardLayout title="Operations">
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    </DashboardLayout>
  );
}
