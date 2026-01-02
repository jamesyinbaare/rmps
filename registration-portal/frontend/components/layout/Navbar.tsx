"use client";

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
import { isAuthenticated } from "@/lib/auth";
import { GraduationCap, LogIn, User } from "lucide-react";
import { ThemeSwitcher } from "@/components/ctvet/ThemeSwitcher";

export function Navbar() {
  const pathname = usePathname();
  const authenticated = isAuthenticated();

  return (
    <nav className="border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <GraduationCap className="h-6 w-6 text-primary" />
          <span className="text-xl font-bold text-primary">CTVET Registration Portal</span>
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
          {authenticated ? (
            <Link href="/dashboard">
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
      </div>
    </nav>
  );
}
