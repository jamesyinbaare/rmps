"use client";

import { Building2 } from "lucide-react";

import { BottomSheet } from "@/components/bottom-sheet";
import { PostedInspectorsList } from "@/components/posted-inspectors-list";
import { Button } from "@/components/ui/button";
import type { ExecutivePostedInspectorItem } from "@/lib/api";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolCode: string;
  schoolName: string;
  centreCode?: string | null;
  centreName?: string | null;
  postedInspectors?: ExecutivePostedInspectorItem[];
  onChangeSchool?: () => void;
};

export function ScriptControlSchoolNameSheet({
  open,
  onOpenChange,
  schoolCode,
  schoolName,
  centreCode,
  centreName,
  postedInspectors = [],
  onChangeSchool,
}: Props) {
  const centreCodeTrimmed = centreCode?.trim();
  const centreNameTrimmed = centreName?.trim();
  const showCentre = Boolean(centreCodeTrimmed || centreNameTrimmed);

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`${schoolCode} — ${schoolName}`}
      disableAutoFocus
      footer={
        onChangeSchool ? (
          <Button type="button" className="w-full" onClick={onChangeSchool}>
            Change school
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5 pb-2">
        {!showCentre ? (
          <p className="text-base leading-relaxed text-foreground">{schoolName}</p>
        ) : null}

        {showCentre ? (
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Examination centre
            </p>
            {centreCodeTrimmed ? (
              <p className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-primary">
                <Building2 className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                {centreCodeTrimmed}
              </p>
            ) : null}
            {centreNameTrimmed ? (
              <p className="text-base leading-relaxed text-foreground">{centreNameTrimmed}</p>
            ) : null}
            <PostedInspectorsList inspectors={postedInspectors} />
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
