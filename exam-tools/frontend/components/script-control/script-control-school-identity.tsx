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
  /** When false, only the school name is shown (code omitted to avoid repetition). */
  showCode?: boolean;
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
  showCode = true,
  showChangeButton = false,
  className,
}: Props) {
  const displayName = schoolName?.trim() || null;
  const [sheetOpen, setSheetOpen] = useState(false);
  const canChangeSchool = Boolean(onChangeSchool);

  function handleChangeSchool() {
    setSheetOpen(false);
    onChangeSchool?.();
  }

  const codeClassName =
    "font-mono text-sm font-semibold text-foreground max-lg:text-base";

  return (
    <>
      <div className={cn("min-w-0", className)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            {showCode ? (
              canChangeSchool ? (
                <button
                  type="button"
                  className={cn(
                    codeClassName,
                    "max-w-full truncate text-left text-primary underline decoration-primary/40 underline-offset-2 hover:text-primary-hover",
                  )}
                  onClick={onChangeSchool}
                >
                  {schoolCode}
                  <span className="sr-only">. Tap to find or change school.</span>
                </button>
              ) : (
                <p className={cn(codeClassName, "truncate")}>{schoolCode}</p>
              )
            ) : null}
            {displayName ? (
              <button
                type="button"
                className={cn(
                  "block w-full min-w-0 max-w-full truncate text-left text-sm text-muted-foreground hover:text-foreground",
                  showCode ? "mt-0.5" : "mt-0",
                )}
                onClick={() => setSheetOpen(true)}
                title={displayName}
              >
                {displayName}
                <span className="sr-only">. Tap to read full school name.</span>
              </button>
            ) : showCode && canChangeSchool ? (
              <p className="mt-0.5 text-xs text-muted-foreground max-lg:text-sm">
                Tap the school code to find or change school.
              </p>
            ) : !showCode && canChangeSchool ? (
              <p className="text-xs text-muted-foreground max-lg:text-sm">
                Tap the school name for details or change school.
              </p>
            ) : null}
          </div>
          {showChangeButton && canChangeSchool ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="hidden shrink-0 lg:inline-flex"
              onClick={onChangeSchool}
            >
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
          onChangeSchool={canChangeSchool ? handleChangeSchool : undefined}
        />
      ) : null}
    </>
  );
}
