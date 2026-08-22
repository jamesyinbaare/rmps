"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { getCurrentUser } from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";

/**
 * Data clerks may only work assigned batches — not browse results or manage certificates.
 */
export default function ResultsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (normalizeRole(user.role) === "DATACLERK") {
          router.replace("/clerk");
          return;
        }
        if (!cancelled) setAllowed(true);
      } catch {
        // AuthGuard handles unauthenticated users
        if (!cancelled) setAllowed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex min-h-[40vh] flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
