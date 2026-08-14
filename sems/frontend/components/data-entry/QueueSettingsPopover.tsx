"use client";

import { Loader2, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ExtractionProvider } from "@/types/document";

interface QueueSettingsPopoverProps {
  extractionProvider: ExtractionProvider;
  onExtractionProviderChange: (provider: ExtractionProvider) => void;
  skipWithoutExtractedId: boolean;
  onSkipWithoutExtractedIdChange: (enabled: boolean) => void;
  concurrentWorkers: number;
  workersMax: number;
  rateLimitPerSecond: number;
  onConcurrentWorkersChange: (workers: number) => void;
  updatingWorkers?: boolean;
  disabled?: boolean;
}

export function QueueSettingsPopover({
  extractionProvider,
  onExtractionProviderChange,
  skipWithoutExtractedId,
  onSkipWithoutExtractedIdChange,
  concurrentWorkers,
  workersMax,
  rateLimitPerSecond,
  onConcurrentWorkersChange,
  updatingWorkers,
  disabled,
}: QueueSettingsPopoverProps) {
  const workerOptions = Array.from(
    new Set([
      ...Array.from({ length: Math.min(workersMax, 20) }, (_, i) => i + 1),
      concurrentWorkers,
    ])
  )
    .filter((n) => n >= 1 && n <= workersMax)
    .sort((a, b) => a - b);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          disabled={disabled}
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">Queue settings</p>
          <p className="text-xs text-muted-foreground">
            Applies to the next queue action. API rate limit is {rateLimitPerSecond}/s.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Provider</Label>
          <Select
            value={extractionProvider}
            onValueChange={(value) =>
              onExtractionProviderChange(value as ExtractionProvider)
            }
            disabled={disabled}
          >
            <SelectTrigger size="sm" className="h-8 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="reducto">Reducto</SelectItem>
              <SelectItem value="llama">Llama Extract</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="skip-without-extracted-id"
            checked={skipWithoutExtractedId}
            onCheckedChange={(checked) => onSkipWithoutExtractedIdChange(checked === true)}
            disabled={disabled}
          />
          <Label htmlFor="skip-without-extracted-id" className="cursor-pointer font-normal">
            Skip sheets without an extracted ID
          </Label>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Documents at a time</Label>
          <div className="flex items-center gap-2">
            <Select
              value={String(concurrentWorkers)}
              onValueChange={(value) => onConcurrentWorkersChange(parseInt(value, 10))}
              disabled={updatingWorkers || disabled}
            >
              <SelectTrigger size="sm" className="h-8 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {workerOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {updatingWorkers && (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
