"use client";

import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

const WORKFLOW_STEPS = [
  { key: "pending_payment", label: "Pending Payment" },
  { key: "paid", label: "Paid" },
  { key: "in_process", label: "In Process" },
  { key: "ready_for_dispatch", label: "Ready for Dispatch" },
  { key: "dispatched", label: "Dispatched" },
  { key: "received", label: "Received" },
  { key: "completed", label: "Completed" },
];

interface WorkflowProgressProps {
  currentStatus: string;
  className?: string;
}

export function WorkflowProgress({ currentStatus, className }: WorkflowProgressProps) {
  const currentIndex = WORKFLOW_STEPS.findIndex((step) => step.key === currentStatus);
  const isCancelled = currentStatus === "cancelled";

  if (isCancelled) {
    return (
      <div className={cn("space-y-2", className)}>
        <div className="text-sm text-muted-foreground">Status: Cancelled</div>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="text-sm font-medium">Workflow Progress</div>
      <div className="relative">
        {/* Progress Line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-muted">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{
              width: `${(currentIndex / (WORKFLOW_STEPS.length - 1)) * 100}%`,
            }}
          />
        </div>

        {/* Steps */}
        <div className="relative flex justify-between">
          {WORKFLOW_STEPS.map((step, index) => {
            const isCompleted = index <= currentIndex;
            const isCurrent = index === currentIndex;

            return (
              <div key={step.key} className="flex flex-col items-center gap-2 flex-1">
                <div
                  className={cn(
                    "relative z-10 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all",
                    isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : "bg-background border-muted text-muted-foreground",
                    isCurrent && "ring-2 ring-primary ring-offset-2"
                  )}
                >
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5" />
                  ) : (
                    <Circle className="h-5 w-5" />
                  )}
                </div>
                <div
                  className={cn(
                    "text-xs text-center max-w-[80px]",
                    isCurrent ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
