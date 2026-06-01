"use client";

import { BottomSheet } from "@/components/bottom-sheet";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolCode: string;
  schoolName: string;
  onChangeSchool?: () => void;
};

export function ScriptControlSchoolNameSheet({
  open,
  onOpenChange,
  schoolCode,
  schoolName,
  onChangeSchool,
}: Props) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title={`School ${schoolCode}`}
      disableAutoFocus
      footer={
        onChangeSchool ? (
          <Button type="button" className="w-full" onClick={onChangeSchool}>
            Change school
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-3 pb-2">
        <p className="font-mono text-lg font-semibold text-foreground">{schoolCode}</p>
        <p className="text-base leading-relaxed text-foreground">{schoolName}</p>
      </div>
    </BottomSheet>
  );
}
