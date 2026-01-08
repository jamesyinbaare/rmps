"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CertificateConfirmationPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new requests page
    router.replace("/certificate-confirmation/requests");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">Redirecting...</div>
    </div>
  );
}
