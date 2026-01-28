"use client";

import { Fragment } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, FileText, XCircle } from "lucide-react";
import type { ExaminerApplicationStatus } from "@/types";
import { cn } from "@/lib/utils";

interface ApplicationStatusTrackerProps {
  status: ExaminerApplicationStatus;
}

const statusSteps: {
  status: ExaminerApplicationStatus;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
}[] = [
  {
    status: "DRAFT",
    label: "Draft",
    icon: FileText,
    description: "Application is being prepared",
  },
  {
    status: "SUBMITTED",
    label: "Submitted",
    icon: Clock,
    description: "Application has been submitted for review",
  },
  {
    status: "UNDER_REVIEW",
    label: "Under Review",
    icon: Clock,
    description: "Application is being reviewed",
  },
  {
    status: "ACCEPTED",
    label: "Accepted",
    icon: CheckCircle2,
    description: "Application has been accepted",
  },
  {
    status: "REJECTED",
    label: "Rejected",
    icon: XCircle,
    description: "Application has been rejected",
  },
];

export function ApplicationStatusTracker({ status }: ApplicationStatusTrackerProps) {
  const currentStatusIndex = statusSteps.findIndex((step) => step.status === status);

  return (
    <Card>
      <CardHeader className="p-4 md:p-6">
        <CardTitle className="text-lg md:text-2xl">Application Status</CardTitle>
        <CardDescription>Track the progress of your application</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
        {/* Mobile: compact vertical list */}
        <div className="space-y-3 md:hidden">
          {statusSteps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = index < currentStatusIndex;
            const isCurrent = index === currentStatusIndex;
            const isPending = index > currentStatusIndex;

            return (
              <div key={step.status} className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2",
                    isCompleted && "border-primary bg-primary text-primary-foreground",
                    isCurrent && "border-primary bg-primary text-primary-foreground",
                    isPending && "border-muted bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        isCurrent && "text-primary",
                        isPending && "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </p>
                    {isCurrent && (
                      <Badge variant="default" className="text-xs shrink-0">
                        Current
                      </Badge>
                    )}
                    {isCompleted && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Completed
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop: horizontal stepper */}
        <div className="hidden md:flex md:w-full md:items-start">
          {statusSteps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = index < currentStatusIndex;
            const isCurrent = index === currentStatusIndex;
            const isPending = index > currentStatusIndex;
            const isLast = index === statusSteps.length - 1;

            return (
              <Fragment key={step.status}>
                <div className="flex flex-1 flex-col items-center">
                  <div
                    className={cn(
                      "flex h-10 w-10 items-center justify-center rounded-full border-2",
                      isCompleted && "border-primary bg-primary text-primary-foreground",
                      isCurrent && "border-primary bg-primary text-primary-foreground",
                      isPending && "border-muted bg-muted text-muted-foreground"
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-center text-sm font-medium",
                      isCurrent && "text-primary",
                      isPending && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </p>
                  <div className="mt-1 flex flex-wrap justify-center gap-1">
                    {isCurrent && (
                      <Badge variant="default" className="text-xs">
                        Current
                      </Badge>
                    )}
                    {isCompleted && (
                      <Badge variant="secondary" className="text-xs">
                        Completed
                      </Badge>
                    )}
                  </div>
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      "mx-1 mt-5 h-0.5 min-w-[16px] flex-2 self-start",
                      isCompleted ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
