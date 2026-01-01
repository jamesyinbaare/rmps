"use client";

import { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";
import { isAuthenticated } from "@/lib/api";

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const pathname = usePathname();
  const [isChecking, setIsChecking] = useState(true);
  const hasRedirected = useRef(false);

  useEffect(() => {
    // Don't protect the login page
    if (pathname === "/login") {
      setIsChecking(false);
      return;
    }

    // Check if user is authenticated
    if (!isAuthenticated()) {
      // Prevent multiple redirects
      if (!hasRedirected.current) {
        hasRedirected.current = true;
        // Use window.location.href for immediate redirect
        window.location.href = `/login?redirect=${encodeURIComponent(pathname)}`;
        return;
      }
    } else {
      // Reset redirect flag if authenticated
      hasRedirected.current = false;
      setIsChecking(false);
    }
  }, [pathname]);

  // Show nothing while checking
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
