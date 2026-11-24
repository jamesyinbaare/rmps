"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/dashboard/PageHeader";
import {
  ManualMarkdown,
  extractManualToc,
} from "@/components/help/ManualMarkdown";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  downloadSchoolRegistrationManualPdf,
  fetchSchoolRegistrationManualMarkdown,
  getCurrentUser,
} from "@/lib/api";
import type { User } from "@/types";
import { cn } from "@/lib/utils";

const SCHOOL_ROLES = new Set(["SchoolAdmin", "SchoolStaff"]);
const PLATFORM_ROLES = new Set([
  "SystemAdmin",
  "Director",
  "DeputyDirector",
  "PrincipalManager",
  "SeniorManager",
  "Manager",
  "Staff",
]);

export default function HelpPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [loadingManual, setLoadingManual] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Help & Support";
    const load = async () => {
      try {
        const current = await getCurrentUser();
        setUser(current);
      } catch (error) {
        console.error("Failed to load user for help page", error);
        toast.error("Unable to load help for your account");
      } finally {
        setLoadingUser(false);
      }
    };
    void load();
  }, []);

  const isSchoolUser = user ? SCHOOL_ROLES.has(user.role) : false;
  const isPlatformUser = user ? PLATFORM_ROLES.has(user.role) : false;

  useEffect(() => {
    if (!isSchoolUser) return;

    const loadManual = async () => {
      setLoadingManual(true);
      try {
        const content = await fetchSchoolRegistrationManualMarkdown();
        setMarkdown(content);
      } catch (error) {
        console.error("Failed to load school manual", error);
        toast.error(
          error instanceof Error ? error.message : "Failed to load user manual"
        );
      } finally {
        setLoadingManual(false);
      }
    };
    void loadManual();
  }, [isSchoolUser]);

  const toc = useMemo(
    () => (markdown ? extractManualToc(markdown) : []),
    [markdown]
  );

  useEffect(() => {
    if (!toc.length) return;

    const headings = toc
      .map((item) => document.getElementById(item.id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-20% 0px -60% 0px", threshold: [0.1, 0.5, 1] }
    );

    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [toc, markdown]);

  const handleDownloadPdf = async () => {
    setDownloading(true);
    try {
      await downloadSchoolRegistrationManualPdf();
      toast.success("Manual PDF downloaded");
    } catch (error) {
      console.error("Failed to download manual PDF", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to download PDF"
      );
    } finally {
      setDownloading(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-[28rem] w-full" />
      </div>
    );
  }

  if (isPlatformUser && !isSchoolUser) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader
          title="Help & Support"
          subtitle="Documentation for platform operators."
        />
        <div className="max-w-2xl space-y-3 rounded-lg border border-border bg-muted/30 p-5 text-sm text-muted-foreground">
          <p>
            The <strong className="text-foreground">School Registration User Manual</strong>{" "}
            is available to school coordinators and school staff under Help &amp; Support
            on the school portal.
          </p>
          <p>
            A comprehensive <strong className="text-foreground">admin operator manual</strong>{" "}
            covering exams, fees oversight, index generation, and related workflows is
            coming soon.
          </p>
        </div>
      </div>
    );
  }

  if (!isSchoolUser) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader
          title="Help & Support"
          subtitle="No manual is available for this account type."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Help & Support"
        subtitle="School registration guide for coordinators and school staff."
        actions={
          <Button
            type="button"
            onClick={() => void handleDownloadPdf()}
            disabled={downloading || loadingManual || !markdown}
          >
            {downloading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download PDF
          </Button>
        }
      />

      {loadingManual || !markdown ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-[32rem] w-full" />
        </div>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav
            aria-label="Manual sections"
            className="hidden lg:block lg:sticky lg:top-6 lg:self-start"
          >
            <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contents
            </p>
            <ul className="max-h-[calc(100vh-8rem)] space-y-1 overflow-y-auto border-l border-border pr-2 text-sm">
              {toc
                .filter((item) => item.level === 2)
                .map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className={cn(
                        "block border-l-2 py-1 pl-3 text-muted-foreground transition-colors hover:text-foreground",
                        activeId === item.id
                          ? "border-foreground font-medium text-foreground"
                          : "border-transparent"
                      )}
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
            </ul>
          </nav>

          <ManualMarkdown content={markdown} />
        </div>
      )}
    </div>
  );
}
