"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const inputFocusRing =
  "focus:outline-none focus:ring-2 focus:ring-ring/30 focus:ring-offset-2 focus:ring-offset-background";

const examinationsLinks = [
  { href: "/login/inspector", label: "Inspector" },
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
  const [examsOpen, setExamsOpen] = useState(false);
  const desktopWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (
        desktopWrapRef.current &&
        !desktopWrapRef.current.contains(e.target as Node)
      ) {
        setExamsOpen(false);
      }
    }
    if (examsOpen) {
      document.addEventListener("mousedown", onPointerDown);
      return () => document.removeEventListener("mousedown", onPointerDown);
    }
  }, [examsOpen]);

  const homeActive = pathname === "/";
  const examinationsActive = examinationsLinks.some((l) =>
    routeActive(pathname, l.href),
  );

  const navLinkClass = (active: boolean) =>
    `text-sm font-medium transition-colors hover:text-primary ${inputFocusRing} rounded-md px-2 py-1 ${
      active ? "text-primary" : "text-muted-foreground"
    }`;

  const dropdownItemClass = (href: string) =>
    `block rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted ${inputFocusRing} ${
      routeActive(pathname, href)
        ? "bg-muted text-foreground font-medium"
        : "text-foreground"
    }`;

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2.5 sm:px-6">
        <Link
          href="/"
          className={`inline-flex min-w-0 shrink items-center gap-2.5 rounded-lg px-1 py-1 ${inputFocusRing}`}
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

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
          <Link href="/" className={navLinkClass(homeActive)}>
            Home
          </Link>
          <div className="relative" ref={desktopWrapRef}>
            <button
              type="button"
              aria-expanded={examsOpen}
              aria-haspopup="menu"
              aria-controls="examinations-menu-desktop"
              onClick={() => setExamsOpen((o) => !o)}
              className={`flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium transition-colors hover:text-primary ${inputFocusRing} ${
                examinationsActive || examsOpen
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              Examinations
              <span
                className="inline-block text-xs transition-transform"
                aria-hidden
                style={{ transform: examsOpen ? "rotate(180deg)" : "none" }}
              >
                ▾
              </span>
            </button>
            {examsOpen ? (
              <div
                id="examinations-menu-desktop"
                role="menu"
                className="absolute left-0 top-full z-100 mt-2 min-w-48 rounded-lg border border-border bg-card p-1 shadow-lg"
              >
                {examinationsLinks.map(({ href, label }) => (
                  <Link
                    key={href}
                    href={href}
                    role="menuitem"
                    className={dropdownItemClass(href)}
                    onClick={() => setExamsOpen(false)}
                  >
                    {label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <Link
            href="/login/admin"
            className={`rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground ${inputFocusRing}`}
          >
            Admin
          </Link>
        </div>

        <button
          type="button"
          className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-input-border bg-background lg:hidden ${inputFocusRing}`}
          aria-expanded={mobileOpen}
          aria-controls="public-mobile-nav"
          aria-label={mobileOpen ? "Close menu" : "Open menu"}
          onClick={() => setMobileOpen((o) => !o)}
        >
          <span className="text-lg leading-none" aria-hidden>
            {mobileOpen ? "✕" : "☰"}
          </span>
        </button>
      </div>

      {mobileOpen ? (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 bg-foreground/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <div
            id="public-mobile-nav"
            className="relative z-50 border-t border-border bg-card px-4 py-4 shadow-lg lg:hidden"
          >
            <nav className="flex flex-col gap-1" aria-label="Mobile main">
              <Link
                href="/"
                className={`rounded-lg px-3 py-2.5 text-sm font-medium ${inputFocusRing} ${
                  homeActive
                    ? "bg-primary text-primary-foreground"
                    : "text-card-foreground hover:bg-muted"
                }`}
                onClick={() => setMobileOpen(false)}
              >
                Home
              </Link>
              <p className="px-3 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Examinations
              </p>
              {examinationsLinks.map(({ href, label }) => {
                const active = routeActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`rounded-lg px-3 py-2.5 pl-6 text-sm font-medium ${inputFocusRing} ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-card-foreground hover:bg-muted"
                    }`}
                    onClick={() => setMobileOpen(false)}
                  >
                    {label}
                  </Link>
                );
              })}
              <div className="mt-2 border-t border-border pt-2">
                <Link
                  href="/login/admin"
                  className={`block rounded-lg px-3 py-2.5 text-sm font-medium text-card-foreground hover:bg-muted ${inputFocusRing}`}
                  onClick={() => setMobileOpen(false)}
                >
                  System administrator
                </Link>
              </div>
            </nav>
          </div>
        </>
      ) : null}
    </header>
  );
}
