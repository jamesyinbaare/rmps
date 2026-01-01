"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";
import { ExamProgressDashboard } from "@/components/ExamProgressDashboard";

export default function Home() {
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
