"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { isAuthenticated, getCurrentUser } from "@/lib/api";
import { LogIn, User, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import type { User as UserType } from "@/types";

interface NavbarProps {
  /** Overlay sits on the landing photo; default is solid chrome for interior public pages. */
  variant?: "default" | "overlay";
}

export function Navbar({ variant = "default" }: NavbarProps) {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    setMounted(true);
    const auth = isAuthenticated();
    setAuthenticated(auth);

    if (auth) {
      getCurrentUser()
        .then(setUser)
        .catch(() => {
          // Handle error silently
        });
    }
  }, []);

  const linkClass = (active: boolean) =>
    cn(
      "text-sm font-medium transition-colors hover:text-primary",
      active ? "text-primary" : "text-muted-foreground"
    );

  return (
    <nav
      className={cn(
        "relative z-50",
        variant === "overlay"
          ? "bg-background/10 backdrop-blur-sm"
          : "border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      )}
    >
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link
          href="/"
          className="flex min-w-0 flex-shrink items-center gap-2"
        >
          <Image
            src="/logo-crest-only.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
            priority
          />
          <span className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
            CTVET
          </span>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/results"
            className={linkClass(
              pathname === "/results" ||
                Boolean(pathname?.startsWith("/results/"))
            )}
          >
            Results
          </Link>
          <Link href="/login" className={linkClass(pathname === "/login")}>
            Staff
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <div suppressHydrationWarning>
            {!mounted ? (
              <Link href="/login">
                <Button size="sm">
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign in
                </Button>
              </Link>
            ) : authenticated ? (
              <Link
                href={
                  user?.role === "PublicUser"
                    ? "/dashboard/private"
                    : "/dashboard"
                }
              >
                <Button variant="outline" size="sm">
                  <User className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="sm">
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign in
                </Button>
              </Link>
            )}
          </div>

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>Menu</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-4">
                <Link
                  href="/results"
                  onClick={() => setMobileMenuOpen(false)}
                  className={linkClass(
                    pathname === "/results" ||
                      Boolean(pathname?.startsWith("/results/"))
                  )}
                >
                  Results
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className={linkClass(pathname === "/login")}
                >
                  Staff
                </Link>
                <Link
                  href="/examinations"
                  onClick={() => setMobileMenuOpen(false)}
                  className={linkClass(pathname === "/examinations")}
                >
                  Examinations
                </Link>
                <Link
                  href="/login/private"
                  onClick={() => setMobileMenuOpen(false)}
                  className={linkClass(pathname === "/login/private")}
                >
                  Private candidate
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
