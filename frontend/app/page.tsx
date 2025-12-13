import Link from "next/link";
import { Button } from "@/components/ui/button";
import { DashboardLayout } from "@/components/DashboardLayout";
import { TopBar } from "@/components/TopBar";

export default function Home() {
  return (
    <DashboardLayout title="Home">
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar title="Home" />
        <main className="flex-1 overflow-y-auto flex items-center justify-center">
        <div className="flex flex-col items-center justify-center gap-8 text-center px-4">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight">Document Management System</h1>
            <p className="text-lg text-muted-foreground max-w-md">
              Document Tracking System for Certificate II Examination
            </p>
          </div>
          <Link href="/documents">
            <Button size="lg">Go to Document Management</Button>
          </Link>
        </div>
        </main>
      </div>
    </DashboardLayout>
  );
}
