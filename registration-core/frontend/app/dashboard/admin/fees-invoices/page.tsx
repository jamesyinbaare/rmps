"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FeesInvoicesWorkspace } from "@/components/fees/FeesInvoicesWorkspace";
import { getCurrentUser } from "@/lib/api";
import type { User } from "@/types";

export default function AdminFeesInvoicesPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const user: User = await getCurrentUser();
        if (
          user.role === "SchoolAdmin" ||
          user.role === "SchoolStaff" ||
          user.role === "PublicUser"
        ) {
          router.replace("/dashboard");
          return;
        }
        setAllowed(true);
      } catch {
        router.replace("/dashboard");
      } finally {
        setChecking(false);
      }
    };
    check();
  }, [router]);

  if (checking || !allowed) {
    return (
      <div className="py-12 text-center text-muted-foreground">Loading…</div>
    );
  }

  return <FeesInvoicesWorkspace mode="admin" />;
}
