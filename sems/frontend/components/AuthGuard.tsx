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

  if (isChecking) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <div className="h-12 border-b bg-muted/40" />
        <div className="flex flex-1">
          <div className="hidden w-56 border-r bg-muted/20 md:block" />
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" aria-label="Loading" />
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
