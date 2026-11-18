"use client";

import type { ReactNode } from "react";
import { Building2 } from "lucide-react";
import type { SchoolDetail } from "@/types";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Badge } from "@/components/ui/badge";

export function SchoolProfileHeader({
  school,
  back,
}: {
  school: SchoolDetail;
  back?: ReactNode;
}) {
  return (
    <PageHeader
      back={back}
      title={school.name}
      subtitle={
        <span className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5" />
          Code: {school.code}
        </span>
      }
      actions={
        <Badge
          variant="outline"
          className={
            school.is_active
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-muted text-muted-foreground"
          }
        >
          {school.is_active ? "Active" : "Inactive"}
        </Badge>
      }
    />
  );
}
