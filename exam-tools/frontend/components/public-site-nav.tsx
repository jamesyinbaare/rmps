"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Menu, Shield, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const inputFocusRing =
  "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2 focus:ring-offset-background";

const examinationsLinks = [
  { href: "/login/inspector", label: "Inspector" },
  { href: "/login/depot-keeper", label: "Depot Keeper" },
  { href: "/login/supervisor", label: "Supervisor" },
] as const;

function routeActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/") return false;
  return pathname.startsWith(`${href}/`);
}

export function PublicSiteNav() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [examsPopoverOpen, setExamsPopoverOpen] = useState(false);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const examsMenuId = useId();

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) {
        setMobileOpen(false);
        setExamsPopoverOpen(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prevBody = document.body.style.overflow;
    const prevHtml = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBody;
      document.documentElement.style.overflow = prevHtml;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileOpen(false);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  const prevMobileOpen = useRef(false);
  useEffect(() => {
    if (prevMobileOpen.current && !mobileOpen) {
      mobileMenuButtonRef.current?.focus();
    }
    prevMobileOpen.current = mobileOpen;
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    const t = window.setTimeout(() => {
      const closeBtn = drawerRef.current?.querySelector<HTMLElement>(
        "[data-mobile-drawer-close]",
      );
      closeBtn?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [mobileOpen]);

  const homeActive = pathname === "/";
  const examinationsActive = examinationsLinks.some((l) =>
    routeActive(pathname, l.href),
  );

  const navLinkClass = (active: boolean) =>
    cn(
      "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
      inputFocusRing,
      active
        ? "bg-primary/10 text-primary"
        : "text-muted-foreground hover:bg-muted hover:text-foreground",
    );

  const dropdownItemClass = (href: string) =>
    cn(
      "block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted",
      inputFocusRing,
      routeActive(pathname, href)
        ? "bg-muted font-medium text-foreground"
        : "text-foreground",
    );

  const adminLinkClass = cn(
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
    inputFocusRing,
  );

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 shadow-sm backdrop-blur supports-backdrop-filter:bg-background/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:px-6 sm:py-3.5">
        <Link
          href="/"
          className={cn(
            "inline-flex min-w-0 shrink items-center gap-2.5 rounded-lg px-1 py-1",
            inputFocusRing,
          )}
        >
          <span className="relative h-8 w-8 overflow-hidden rounded-md border border-border/80 bg-card sm:h-9 sm:w-9">
            <Image
              src="/logo-crest-only.png"
              alt="CTVET crest"
              fill
              sizes="(min-width: 640px) 36px, 32px"
              className="object-cover"
              priority
            />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-xs font-semibold uppercase tracking-[0.18em] text-primary sm:text-sm">
              CTVET
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              Examination Portal
            </span>
          </span>
        </Link>

        <nav
          className="hidden items-center gap-1 rounded-xl border border-border/70 bg-card/70 p-1 lg:flex"
          aria-label="Main"
        >
          <Link href="/" className={navLinkClass(homeActive)}>
            Home
          </Link>
          <Popover open={examsPopoverOpen} onOpenChange={setExamsPopoverOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-expanded={examsPopoverOpen}
                aria-controls={examsMenuId}
                className={cn(
                  "flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors motion-reduce:transition-none",
                  inputFocusRing,
                  examinationsActive || examsPopoverOpen
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Examinations
                <ChevronDown
                  className={cn(
                    "size-4 shrink-0 opacity-70 transition-transform motion-reduce:transition-none",
                    examsPopoverOpen && "rotate-180",
                  )}
                  aria-hidden
                />
              </button>
            </PopoverTrigger>
            <PopoverContent
              id={examsMenuId}
              align="start"
              sideOffset={8}
              className="w-auto min-w-52 border-border bg-card p-1.5 shadow-lg"
            >
              <ul className="flex flex-col gap-0.5" role="list">
                {examinationsLinks.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className={dropdownItemClass(href)}
                      onClick={() => setExamsPopoverOpen(false)}
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link href="/login/admin" className={adminLinkClass}>
            <Shield className="size-4 shrink-0 opacity-70" aria-hidden />
            Admin sign-in
          </Link>
        </div>

        <Button
          ref={mobileMenuButtonRef}
          type="button"
          variant="outline"
          size="icon"
          className={cn("shrink-0 lg:hidden", inputFocusRing)}
          aria-expanded={mobileOpen}
          aria-controls="public-mobile-nav"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((o) => !o)}
        >
          {mobileOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
        </Button>
      </div>
    </header>

    {mobileOpen ? (
      <>
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 z-[100] bg-foreground/40 motion-safe:transition-opacity motion-reduce:transition-none lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
        <div
          id="public-mobile-nav"
          ref={drawerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="public-mobile-nav-title"
          className={cn(
            "fixed inset-y-0 right-0 z-[110] flex max-h-dvh min-h-0 w-full max-w-sm flex-col overflow-x-hidden border-l border-border bg-background shadow-2xl motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300 motion-reduce:animate-none sm:rounded-l-2xl lg:hidden",
          )}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border/80 bg-card/80 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-sm">
            <div className="min-w-0 flex-1">
              <p id="public-mobile-nav-title" className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-primary">
                CTVET
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn("size-10 shrink-0 rounded-full border-border/80", inputFocusRing)}
              data-mobile-drawer-close
              aria-label="Close menu"
              onClick={() => setMobileOpen(false)}
            >
              <X className="size-5" aria-hidden />
            </Button>
          </div>
          <nav
            className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4"
            aria-label="Mobile main"
          >
            <Link
              href="/"
              className={cn(
                "flex min-h-12 min-w-0 items-center rounded-xl border border-transparent px-4 text-base font-medium transition-colors",
                inputFocusRing,
                homeActive
                  ? "border-primary/20 bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/40 text-foreground hover:bg-muted",
              )}
              onClick={() => setMobileOpen(false)}
            >
              Home
            </Link>

            <div className="min-w-0 rounded-2xl border border-border/60 bg-muted/25 p-1">
              <p className="px-3 pb-1 pt-2 text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground">
                Examinations
              </p>
              <ul className="flex flex-col gap-0.5 pb-1" role="list">
                {examinationsLinks.map(({ href, label }) => {
                  const active = routeActive(pathname, href);
                  return (
                    <li key={href} className="min-w-0">
                      <Link
                        href={href}
                        className={cn(
                          "flex min-h-12 min-w-0 items-center rounded-xl px-3 text-base font-medium transition-colors",
                          inputFocusRing,
                          active
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground hover:bg-background/80",
                        )}
                        onClick={() => setMobileOpen(false)}
                      >
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-auto min-w-0 border-t border-border/80 pt-4">
              <Link
                href="/login/admin"
                className={cn(
                  "flex min-h-12 min-w-0 items-center gap-3 rounded-xl border border-border/60 bg-card px-4 text-base font-medium text-foreground shadow-sm transition-colors hover:bg-muted/50",
                  inputFocusRing,
                )}
                onClick={() => setMobileOpen(false)}
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Shield className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <span className="min-w-0 truncate">Admin sign-in</span>
              </Link>
            </div>
          </nav>
        </div>
      </>
    ) : null}
    </>
  );
}
