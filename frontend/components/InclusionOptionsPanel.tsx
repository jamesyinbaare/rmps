"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";

interface InclusionOptionsPanelProps {
  includePending: boolean;
  includeAbsent: boolean;
  onIncludePendingChange: (checked: boolean) => void;
  onIncludeAbsentChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function InclusionOptionsPanel({
  includePending,
  includeAbsent,
  onIncludePendingChange,
  onIncludeAbsentChange,
  disabled = false,
}: InclusionOptionsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="h-4 w-4" />
          Include in Calculations
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="include-pending"
              checked={includePending}
              onCheckedChange={onIncludePendingChange}
              disabled={disabled}
            />
            <div className="space-y-1">
              <Label
                htmlFor="include-pending"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Include Pending Candidates
              </Label>
              <p className="text-xs text-muted-foreground">
                Treat pending candidates as 0.0 in statistics, histogram, and grade distribution
              </p>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <Checkbox
              id="include-absent"
              checked={includeAbsent}
              onCheckedChange={onIncludeAbsentChange}
              disabled={disabled}
            />
            <div className="space-y-1">
              <Label
                htmlFor="include-absent"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Include Absent Candidates
              </Label>
              <p className="text-xs text-muted-foreground">
                Treat absent candidates as 0.0 in statistics, histogram, and grade distribution
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
