"use client";

import Link from "next/link";
import { Calendar, FileCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/dashboard/PageHeader";

const DESTINATIONS = [
  {
    href: "/dashboard/my-school/reports/index-slips",
    icon: FileCheck,
    title: "Index Slips",
    description: "Download index slips for candidates by examination",
    cta: "Open Index Slips",
  },
  {
    href: "/dashboard/my-school/timetables",
    icon: Calendar,
    title: "Timetables",
    description: "View and download examination timetables for your school",
    cta: "Open Timetables",
  },
] as const;

export default function ReportsPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Reports and Documents"
        subtitle="Download index slips and examination timetables"
      />

      <div className="grid gap-4 sm:grid-cols-2">
        {DESTINATIONS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.href}
              className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 shadow-none sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-start gap-3">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
              <Button asChild size="sm" className="h-9 shrink-0 shadow-none">
                <Link href={item.href}>{item.cta}</Link>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
