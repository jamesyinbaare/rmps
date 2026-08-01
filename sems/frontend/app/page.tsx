"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { ExamProgressDashboard } from "@/components/ExamProgressDashboard";
import { getCurrentUser } from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const checkRole = async () => {
      try {
        const user = await getCurrentUser();
        if (normalizeRole(user.role) === "DATACLERK") {
          router.replace("/clerk");
          return;
        }
      } catch {
        // AuthGuard handles unauthenticated users
      } finally {
        setReady(true);
      }
    };
    void checkRole();
  }, [router]);

  if (!ready) {
    return (
      <DashboardLayout title="Home">
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Home">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Home" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8">
            <ExamProgressDashboard />
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
