"use client";

import { useState } from "react";

import { ScriptControlSchoolNameSheet } from "@/components/script-control/script-control-school-name-sheet";
import { Button } from "@/components/ui/button";
import type { ExecutivePostedInspectorItem } from "@/lib/api";
import { cn } from "@/lib/utils";

type Props = {
  schoolCode: string;
  schoolName?: string | null;
  centreCode?: string | null;
  centreName?: string | null;
  postedInspectors?: ExecutivePostedInspectorItem[];
  onChangeSchool?: () => void;
  /** Max lines for school name before ellipsis. */
  nameClamp?: 1 | 2;
  showChangeButton?: boolean;
  className?: string;
};

export function ScriptControlSchoolIdentity({
  schoolCode,
  schoolName,
  centreCode,
  centreName,
  postedInspectors,
  onChangeSchool,
  nameClamp = 2,
  showChangeButton = false,
  className,
}: Props) {
  const displayName = schoolName?.trim();
  const [sheetOpen, setSheetOpen] = useState(false);

  const clampClass = nameClamp === 1 ? "line-clamp-1" : "line-clamp-2";

  function handleChangeSchool() {
    setSheetOpen(false);
    onChangeSchool?.();
  }

  return (
    <>
      <div className={cn("min-w-0", className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-sm font-semibold text-foreground">{schoolCode}</p>
            {displayName ? (
              <button
                type="button"
                className="mt-0.5 w-full text-left text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setSheetOpen(true)}
                title={displayName}
              >
                <span className={cn("block leading-snug", clampClass)}>{displayName}</span>
                <span className="sr-only">. Tap to read full school name.</span>
              </button>
            ) : null}
          </div>
          {showChangeButton && onChangeSchool ? (
            <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={onChangeSchool}>
              Change
            </Button>
          ) : null}
        </div>
      </div>

      {displayName ? (
        <ScriptControlSchoolNameSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          schoolCode={schoolCode}
          schoolName={displayName}
          centreCode={centreCode}
          centreName={centreName}
          postedInspectors={postedInspectors}
          onChangeSchool={onChangeSchool ? handleChangeSchool : undefined}
        />
      ) : null}
    </>
  );
}
