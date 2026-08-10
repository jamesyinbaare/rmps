"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function IssuancesRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/results/certificates/issuances");
  }, [router]);

  return null;
}
