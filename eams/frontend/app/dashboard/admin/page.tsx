"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AdminPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/admin/cycles");
  }, [router]);

  return (
    <div className="flex items-center justify-center p-8">
      <p className="text-muted-foreground">Redirecting...</p>
    </div>
  );
}
