"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

function isAdmin(role: string | number | undefined): boolean {
  if (role === undefined || role === null) return false;
  const r = String(role).toUpperCase();
  return (
    r === "ADMIN" ||
    r === "SYSTEM_ADMIN" ||
    r === "10" ||
    r === "0"
  );
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getCurrentUser()
      .then((me) => {
        if (!isAdmin(me.role)) {
          router.replace("/application");
          return;
        }
        setLoading(false);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    );
  }

  return <>{children}</>;
}
