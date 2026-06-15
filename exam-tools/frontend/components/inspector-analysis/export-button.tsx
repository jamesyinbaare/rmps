"use client";

import { Download, Loader2 } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { officialAccountsBtnPrimary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  busy: boolean;
  disabled: boolean;
  disabledReason?: string;
  onClick: () => void;
  label?: string;
};

export function InspectorAnalysisExportButton({
  busy,
  disabled,
  disabledReason,
  onClick,
  label = "Export Excel",
}: Props) {
  const button = (
    <button
      type="button"
      className={cn(officialAccountsBtnPrimary, "gap-2")}
      disabled={disabled || busy}
      onClick={onClick}
    >
      {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
      {label}
    </button>
  );

  if (!disabled || !disabledReason) return button;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{disabledReason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
