"use client";

import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Exam, School, Subject } from "@/types/document";

interface BreadcrumbItem {
  label: string;
  href: string;
}

interface BreadcrumbsProps {
  exam?: Exam;
  school?: School;
  subject?: Subject;
}

export function Breadcrumbs({ exam, school, subject }: BreadcrumbsProps) {
  const items: BreadcrumbItem[] = [
    { label: "Home", href: "/folders" },
  ];

  if (exam) {
    items.push({ label: exam.name, href: `/folders?exam=${exam.id}` });
  }

  if (exam && school) {
    items.push({ label: school.name, href: `/folders?exam=${exam.id}&school=${school.id}` });
  }

  if (exam && school && subject) {
    items.push({
      label: subject.name,
      href: `/folders?exam=${exam.id}&school=${school.id}&subject=${subject.id}`,
    });
  }

  return (
    <nav className="flex items-center gap-2 px-6 py-3 border-b border-border bg-background">
      {items.map((item, index) => (
        <div key={item.href} className="flex items-center gap-2">
          {index > 0 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          {index === items.length - 1 ? (
            <span className="text-sm font-medium text-foreground">{item.label}</span>
          ) : (
            <Link
              href={item.href}
              className={cn(
                "text-sm text-muted-foreground hover:text-foreground transition-colors",
                index === 0 && "flex items-center gap-1"
              )}
            >
              {index === 0 && <Home className="h-3 w-3" />}
              {item.label}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
