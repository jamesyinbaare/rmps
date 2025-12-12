import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <main className="flex flex-col items-center justify-center gap-8 text-center px-4">
        <div className="space-y-4">
          <h1 className="text-4xl font-bold tracking-tight">Document Management System</h1>
          <p className="text-lg text-muted-foreground max-w-md">
            Document Tracking System for Certificate II Examination
          </p>
        </div>
        <Link href="/documents">
          <Button size="lg">Go to Document Management</Button>
        </Link>
      </main>
    </div>
  );
}
