"use client";

import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { SidebarProvider } from "./SidebarContext";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-svh overflow-hidden bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto overflow-x-hidden bg-background p-4 sm:p-6 md:p-8">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
