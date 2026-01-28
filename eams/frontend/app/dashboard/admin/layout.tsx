"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";

function isAdmin(role: string | number) {
  return (
    role === "ADMIN" ||
    role === "SYSTEM_ADMIN" ||
    role === 10 ||
    role === 0 ||
    role === "10" ||
    role === "0"
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
          router.replace("/dashboard/application");
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
      <div className="flex items-center justify-center p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <>{children}</>;
}
