"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { isAuthenticated } from "@/lib/auth";
import { getCurrentUser, logout } from "@/lib/api";
import type { User } from "@/types";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  Key,
  Coins,
  Search,
  BarChart3,
  BookOpen,
} from "lucide-react";
import { getCreditBalance } from "@/lib/api";
import type { CreditBalance } from "@/types";
import { ApiTopBar } from "@/components/api/ApiTopBar";

export default function ApiDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [creditBalance, setCreditBalance] = useState<CreditBalance | null>(null);

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      setMounted(true);

      if (!isAuthenticated()) {
        router.push("/api/login");
        return;
      }

      try {
        const userData = await getCurrentUser();

        // Only APIUSER can access
        if (userData.role !== "APIUSER") {
          await logout();
          router.push("/api/login");
          return;
        }

        setUser(userData);
        setChecking(false); // Set checking to false first so UI can render

        // Load credit balance asynchronously (non-blocking)
        getCreditBalance()
          .then(setCreditBalance)
          .catch((error) => {
            console.error("Failed to load credit balance:", error);
            // Don't block the UI if credit balance fails to load
          });
      } catch (error) {
        console.error("Failed to get user:", error);
        router.push("/api/login");
        return;
      }
    };

    checkAuthAndLoad();
  }, [router]);


  if (!mounted || checking) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated() || !user) {
    return null;
  }

  const navItems = [
    { href: "/api/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/api/dashboard/api-keys", label: "API Keys", icon: Key },
    { href: "/api/dashboard/credits", label: "Credits", icon: Coins },
    { href: "/api/dashboard/verify", label: "Verify Results", icon: Search },
    { href: "/api/dashboard/analytics", label: "Analytics", icon: BarChart3 },
    { href: "/api/dashboard/docs", label: "Documentation", icon: BookOpen },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Top Bar */}
      <ApiTopBar user={user} creditBalance={creditBalance} />

      {/* Main Layout: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="flex w-72 flex-col border-r border-slate-200 bg-white shadow-lg">
          {/* Navigation */}
          <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md"
                      : "text-slate-700 hover:bg-slate-100 hover:text-blue-600"
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isActive ? "text-white" : "text-slate-500"}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto bg-gradient-to-br from-slate-50 to-blue-50">
          <div className="h-full p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}
