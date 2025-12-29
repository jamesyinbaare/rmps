"use client";

import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";

export default function Home() {
  return (
    <DashboardLayout title="Home">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Home" showSearch={false} />
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 py-8">
            <div className="space-y-2">
              <h1 className="text-3xl font-bold tracking-tight">Welcome</h1>
              <p className="text-muted-foreground">
                Document Management System
              </p>
            </div>
          </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
