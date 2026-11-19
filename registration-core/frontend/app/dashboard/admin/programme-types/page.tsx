"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function ProgrammeTypesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard/admin/programmes?tab=types");
  }, [router]);

  return (
    <div className="mx-auto max-w-5xl p-6 text-sm text-muted-foreground">
      Redirecting to Programmes…
    </div>
  );
}
