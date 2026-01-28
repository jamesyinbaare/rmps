"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser } from "@/lib/api";

/**
 * Redirects to profile/[examiner_id] when user has an examiner, otherwise to account-settings.
 * Kept for backwards compatibility; nav should link directly to profile/[examiner_id] or account-settings.
 */
export default function ProfileRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        const me = await getCurrentUser();
        if (me.examiner_id) {
          router.replace(`/dashboard/profile/${me.examiner_id}`);
        } else {
          router.replace("/dashboard/account-settings");
        }
      } catch {
        router.replace("/dashboard/account-settings");
      }
    };
    run();
  }, [router]);

  return <div className="p-6">Redirecting…</div>;
}
