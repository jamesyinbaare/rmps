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
import { GraduationCap, LogIn, User, Menu, Award, ChevronDown } from "lucide-react";
import { ThemeSwitcher } from "@/components/ctvet/ThemeSwitcher";
import type { User as UserType } from "@/types";

export function Navbar() {
  const pathname = usePathname();
  const [authenticated, setAuthenticated] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [certificateMenuOpen, setCertificateMenuOpen] = useState(false);
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
    <nav className="border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold text-primary">CTVET Online Services</span>
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

          <Link
            href="/login/private"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              pathname === "/login/private" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Registration
          </Link>

          <Link
            href="/results"
            className={`text-sm font-medium transition-colors hover:text-primary ${
              pathname === "/results" ? "text-primary" : "text-muted-foreground"
            }`}
          >
            Results
          </Link>

          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Certificate</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="w-[200px] p-4">
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/certificate-request"
                          className={`block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${
                            pathname === "/certificate-request" ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          Request Certificate
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/certificate-request/status"
                          className={`block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground ${
                            pathname === "/certificate-request/status" ? "bg-accent text-accent-foreground" : ""
                          }`}
                        >
                          Check Status
                        </Link>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>About</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="w-[200px] p-4">
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/about"
                          className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          About Us
                        </Link>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <Link
                          href="/examinations"
                          className="block rounded-md px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                        >
                          Examinations
                        </Link>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>

          <Link
            href="/contact"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
          >
            Contact
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
              <Link href={user?.user_type === "PRIVATE_USER" ? "/dashboard/private" : "/dashboard"}>
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
                <Link
                  href="/login/private"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname === "/login/private" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Registration
                </Link>
                <Link
                  href="/results"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    pathname === "/results" ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  Results
                </Link>
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
                      Request Certificate
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
                      Check Status
                    </Link>
                  </CollapsibleContent>
                </Collapsible>
                <Link
                  href="/about"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  About Us
                </Link>
                <Link
                  href="/examinations"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Examinations
                </Link>
                <Link
                  href="/contact"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  Contact
                </Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
