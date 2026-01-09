"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { isAuthenticated, getCurrentUser } from "@/lib/api";
import { GraduationCap, LogIn, User, Menu, ChevronDown } from "lucide-react";
import { ThemeSwitcher } from "@/components/ctvet/ThemeSwitcher";
import type { User as UserType } from "@/types";

export function Navbar() {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [certificateMenuOpen, setCertificateMenuOpen] = useState(false);
  const [examinationsMenuOpen, setExaminationsMenuOpen] = useState(false);
  const [user, setUser] = useState<UserType | null>(null);

  useEffect(() => {
    setMounted(true);
    const auth = isAuthenticated();
    setAuthenticated(auth);

    // Get user info if authenticated
    if (auth) {
      getCurrentUser()
        .then(setUser)
        .catch(() => {
          // Handle error silently
        });
    }
  }, []);

  return (
    <nav className="relative z-50 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-shrink">
          <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6 text-primary flex-shrink-0" />
          <span className="text-base sm:text-lg md:text-xl font-bold text-primary whitespace-nowrap overflow-hidden">
            <span className="hidden sm:inline">CTVET</span>
            <span className="hidden md:inline"> Online Services</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-6">
          <Link
            href="/"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              pathname === "/" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Home
          </Link>

          <NavigationMenu viewport={false}>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Examinations</NavigationMenuTrigger>
                <NavigationMenuContent
                  className="z-[100] min-w-[240px] rounded-md border shadow-xl"
                  style={{
                    backgroundColor: 'var(--popover)',
                    color: 'var(--popover-foreground)'
                  }}
                >
                  <ul className="w-[240px] p-4" style={{ backgroundColor: 'var(--popover)' }}>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/login"
                          className={`block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
                            pathname === "/login" ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          CTVET School
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/login/private"
                          className={`block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
                            pathname === "/login/private" ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          CTVET Private
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/timetable"
                          className={`block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
                            pathname === "/timetable" ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          Timetable
                        </Link>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <NavigationMenu viewport={false}>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Certificate</NavigationMenuTrigger>
                <NavigationMenuContent
                  className="z-[100] min-w-[280px] rounded-md border shadow-xl"
                  style={{
                    backgroundColor: 'var(--popover)',
                    color: 'var(--popover-foreground)'
                  }}
                >
                  <ul className="w-[280px] p-4" style={{ backgroundColor: 'var(--popover)' }}>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/certificate-request"
                          className={`block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
                            pathname === "/certificate-request" ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          Certificate/Attestation Request
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/certificate-request/status"
                          className={`block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
                            pathname === "/certificate-request/status" ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          Certificate/Attestation Request Status
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/certificate-confirmation"
                          className={`block rounded-md px-3 py-2 text-sm text-foreground hover:bg-accent hover:text-accent-foreground transition-colors ${
                            pathname?.startsWith("/certificate-confirmation") ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          Certificate Confirmation/Verification
                        </Link>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <Link
            href="/results"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              pathname === "/results" || pathname?.startsWith("/results/") ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Results
          </Link>

          <Link
            href="/login"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              pathname === "/login" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Staff
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <ThemeSwitcher />
          <div suppressHydrationWarning>
            {!mounted ? (
              // Render Login during SSR to match initial client render
              <Link href="/login">
                <Button size="sm">
                  <LogIn className="mr-2 h-4 w-4" />
                  Login
                </Button>
              </Link>
            ) : authenticated ? (
              <Link href={user?.role === "PublicUser" ? "/dashboard/private" : "/dashboard"}>
                <Button variant="outline" size="sm">
                  <User className="mr-2 h-4 w-4" />
                  Dashboard
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button size="sm">
                  <LogIn className="mr-2 h-4 w-4" />
                  Login
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile Menu */}
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
                  href="/"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname === "/" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Home
                </Link>
                <Collapsible open={examinationsMenuOpen} onOpenChange={setExaminationsMenuOpen}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
                    Examinations
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        examinationsMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="ml-4 mt-2 flex flex-col gap-2">
                    <Link
                      href="/login"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setExaminationsMenuOpen(false);
                      }}
                      className={`text-sm transition-colors hover:text-primary ${
                        pathname === "/login"
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      CTVET School
                    </Link>
                    <Link
                      href="/login/private"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setExaminationsMenuOpen(false);
                      }}
                      className={`text-sm transition-colors hover:text-primary ${
                        pathname === "/login/private"
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      CTVET Private
                    </Link>
                    <Link
                      href="/timetable"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setExaminationsMenuOpen(false);
                      }}
                      className={`text-sm transition-colors hover:text-primary ${
                        pathname === "/timetable"
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      Timetable
                    </Link>
                  </CollapsibleContent>
                </Collapsible>
                <Collapsible open={certificateMenuOpen} onOpenChange={setCertificateMenuOpen}>
                  <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium text-muted-foreground transition-colors hover:text-primary">
                    Certificate
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        certificateMenuOpen ? "rotate-180" : ""
                      }`}
                    />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="ml-4 mt-2 flex flex-col gap-2">
                    <Link
                      href="/certificate-request"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setCertificateMenuOpen(false);
                      }}
                      className={`text-sm transition-colors hover:text-primary ${
                        pathname === "/certificate-request"
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      Certificate/Attestation Request
                    </Link>
                    <Link
                      href="/certificate-request/status"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setCertificateMenuOpen(false);
                      }}
                      className={`text-sm transition-colors hover:text-primary ${
                        pathname === "/certificate-request/status"
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      Certificate/Attestation Request Status
                    </Link>
                    <Link
                      href="/certificate-confirmation"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        setCertificateMenuOpen(false);
                      }}
                      className={`text-sm transition-colors hover:text-primary ${
                        pathname?.startsWith("/certificate-confirmation")
                          ? "text-primary font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      Certificate Confirmation/Verification
                    </Link>
                  </CollapsibleContent>
                </Collapsible>
                <Link
                  href="/results"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname === "/results" || pathname?.startsWith("/results/") ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Results
                </Link>
                <Link
                  href="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname === "/login" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Staff
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
