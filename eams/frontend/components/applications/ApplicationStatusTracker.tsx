"use client";

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
      <CardHeader>
        <CardTitle>Application Status</CardTitle>
        <CardDescription>Track the progress of your application</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {statusSteps.map((step, index) => {
            const Icon = step.icon;
            const isCompleted = index < currentStatusIndex;
            const isCurrent = index === currentStatusIndex;
            const isPending = index > currentStatusIndex;

            return (
              <div key={step.status} className="flex items-start gap-4">
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
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <p
                      className={cn(
                        "font-medium",
                        isCurrent && "text-primary",
                        isPending && "text-muted-foreground"
                      )}
                    >
                      {step.label}
                    </p>
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
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
