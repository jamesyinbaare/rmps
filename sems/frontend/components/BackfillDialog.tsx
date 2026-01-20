"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { backfillFromExtractedId } from "@/lib/api";
import type { BackfillTestTypeResponse } from "@/types/document";
import { toast } from "sonner";
import { Loader2, Database, AlertCircle, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface BackfillDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function BackfillDialog({
  open,
  onOpenChange,
  onSuccess,
}: BackfillDialogProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<BackfillTestTypeResponse | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [isDryRun, setIsDryRun] = useState(false);

  const handleBackfill = async (dryRun: boolean) => {
    setLoading(true);
    setResults(null);
    setIsDryRun(dryRun);
    try {
      const response = await backfillFromExtractedId(dryRun);
      setResults(response);

      if (dryRun) {
        toast.success(`Preview complete: ${response.total_found} document(s) found`);
      } else {
        toast.success(
          `Backfill complete: ${response.updated} document(s) updated, ${response.failed} failed, ${response.skipped} skipped`
        );
        onSuccess?.();
        // Close dialog after a short delay to show the success message
        setTimeout(() => {
          onOpenChange(false);
          setResults(null);
          setShowErrors(false);
        }, 2000);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to perform backfill operation"
      );
      console.error("Error performing backfill:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
      setResults(null);
      setShowErrors(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle>Backfill Missing Fields from Extracted ID</DialogTitle>
              <DialogDescription className="mt-1">
                Extract and set missing fields (test_type, subject_series, sheet_number, school_id, subject_id) from existing extracted_id values.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              This operation will process documents that have an <code className="bg-muted px-1 rounded">extracted_id</code> but are missing one or more of the following fields:
              <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                <li><code className="bg-muted px-1 rounded">test_type</code></li>
                <li><code className="bg-muted px-1 rounded">subject_series</code></li>
                <li><code className="bg-muted px-1 rounded">sheet_number</code></li>
                <li><code className="bg-muted px-1 rounded">school_id</code></li>
                <li><code className="bg-muted px-1 rounded">subject_id</code></li>
              </ul>
            </AlertDescription>
          </Alert>

          {results && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4 space-y-3">
                <h3 className="font-semibold text-sm">
                  {isDryRun ? "Preview Results" : "Backfill Results"}
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Total Found</div>
                    <div className="text-lg font-semibold">{results.total_found}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Updated</div>
                    <div className="text-lg font-semibold text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      {results.updated}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Failed</div>
                    <div className="text-lg font-semibold text-red-600 flex items-center gap-1">
                      <XCircle className="h-4 w-4" />
                      {results.failed}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">Skipped</div>
                    <div className="text-lg font-semibold text-yellow-600">{results.skipped}</div>
                  </div>
                </div>

                {results.errors.length > 0 && (
                  <Collapsible open={showErrors} onOpenChange={setShowErrors}>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" className="w-full justify-between">
                        <span>View Errors ({results.errors.length})</span>
                        {showErrors ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <div className="rounded-lg border bg-muted/50 p-3 max-h-60 overflow-y-auto">
                        <div className="space-y-2">
                          {results.errors.map((error, index) => (
                            <div key={index} className="text-sm">
                              <div className="font-medium">
                                Document #{error.document_id}
                                {error.extracted_id && (
                                  <span className="text-muted-foreground ml-2">
                                    ({error.extracted_id})
                                  </span>
                                )}
                              </div>
                              <div className="text-muted-foreground text-xs mt-1">
                                {error.error}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            </div>
          )}

          {!results && loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-sm text-muted-foreground">Processing...</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            {results ? "Close" : "Cancel"}
          </Button>
          {!results && (
            <>
              <Button
                variant="outline"
                onClick={() => handleBackfill(true)}
                disabled={loading}
                className="gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Previewing...
                  </>
                ) : (
                  <>
                    Preview (Dry Run)
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleBackfill(false)}
                disabled={loading}
                className="gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    Execute Backfill
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
