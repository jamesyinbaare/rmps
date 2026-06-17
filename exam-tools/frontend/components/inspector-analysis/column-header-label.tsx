"use client";

import { HelpCircle } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type Props = {
  label: string;
  tooltip: string;
  group?: string;
};

export function ColumnHeaderLabel({ label, tooltip, group }: Props) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-1">
            {group ? (
              <span className="sr-only">{group}: </span>
            ) : null}
            <span>{label}</span>
            <HelpCircle className="size-3.5 shrink-0 text-muted-foreground/80" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
