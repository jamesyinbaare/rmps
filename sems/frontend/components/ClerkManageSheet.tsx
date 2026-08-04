"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  releaseIssueBatches,
  setClerkBaseQuota,
  setClerkQuotaOverride,
} from "@/lib/api";
import type { BatchSummaryClerkItem, ClerkQuotaItem } from "@/types/document";

type ClerkManageSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clerk: ClerkQuotaItem | null;
  load: BatchSummaryClerkItem | undefined;
  onUpdated: () => Promise<void> | void;
};

export function ClerkManageSheet({
  open,
  onOpenChange,
  clerk,
  load,
  onUpdated,
}: ClerkManageSheetProps) {
  const [baseQuotaInput, setBaseQuotaInput] = useState("");
  const [overrideInput, setOverrideInput] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [savingBase, setSavingBase] = useState(false);
  const [savingOverride, setSavingOverride] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [current, setCurrent] = useState<ClerkQuotaItem | null>(clerk);

  useEffect(() => {
    if (!clerk) {
      setCurrent(null);
      return;
    }
    setCurrent(clerk);
    setBaseQuotaInput(String(clerk.base_quota));
    setOverrideInput(clerk.override_quota != null ? String(clerk.override_quota) : "");
    setOverrideReason("");
  }, [clerk]);

  const busy = savingBase || savingOverride || releasing;

  const handleSaveBaseQuota = async () => {
    if (!current) return;
    const value = Number(baseQuotaInput);
    if (!Number.isFinite(value) || value < 1) {
      toast.error("Base quota must be a number ≥ 1");
      return;
    }
    setSavingBase(true);
    try {
      const updated = await setClerkBaseQuota(current.user_id, value);
      setCurrent(updated);
      setBaseQuotaInput(String(updated.base_quota));
      toast.success("Base quota updated");
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set quota");
    } finally {
      setSavingBase(false);
    }
  };

  const handleSaveOverride = async () => {
    if (!current) return;
    const trimmed = overrideInput.trim();
    if (trimmed !== "") {
      const value = Number(trimmed);
      if (!Number.isFinite(value) || value < 1) {
        toast.error("Override must be a number ≥ 1");
        return;
      }
    }
    setSavingOverride(true);
    try {
      const updated = await setClerkQuotaOverride(
        current.user_id,
        trimmed === "" ? null : Number(trimmed),
        overrideReason.trim() || undefined
      );
      setCurrent(updated);
      setOverrideInput(
        updated.override_quota != null ? String(updated.override_quota) : ""
      );
      toast.success(trimmed === "" ? "Override cleared" : "Override set for today");
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set override");
    } finally {
      setSavingOverride(false);
    }
  };

  const handleClearOverride = async () => {
    if (!current) return;
    setOverrideInput("");
    setSavingOverride(true);
    try {
      const updated = await setClerkQuotaOverride(current.user_id, null);
      setCurrent(updated);
      toast.success("Override cleared");
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear override");
    } finally {
      setSavingOverride(false);
    }
  };

  const handleReleaseClerk = async () => {
    if (!current) return;
    const ok = window.confirm(
      `Release all batches assigned to ${current.full_name}? They will return to the unassigned pool.`
    );
    if (!ok) return;
    setReleasing(true);
    try {
      const result = await releaseIssueBatches({ user_id: current.user_id });
      toast.success(`Released ${result.released_count} batch(es)`);
      await onUpdated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Release failed");
    } finally {
      setReleasing(false);
    }
  };

  const activeExam =
    current?.active_exam_label || load?.active_exam_label || null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{current ? current.full_name : "Clerk"}</SheetTitle>
          <SheetDescription>
            Quotas, overrides, and release for this dataclerk.
          </SheetDescription>
        </SheetHeader>

        {current ? (
          <div className="px-4 space-y-5">
            <div className="flex flex-wrap gap-2">
              {activeExam ? (
                <Badge variant="secondary">Active: {activeExam}</Badge>
              ) : (
                <Badge variant="outline">No active exam</Badge>
              )}
              {current.quota_overridden ? (
                <Badge variant="outline">Override active</Badge>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">Batches</p>
                <p className="text-lg font-semibold tabular-nums">
                  {load?.assigned_batches ?? 0}
                </p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">Pending</p>
                <p className="text-lg font-semibold tabular-nums">
                  {load?.assigned_pending_issues ?? 0}
                </p>
              </div>
              <div className="rounded-md border px-3 py-2">
                <p className="text-xs text-muted-foreground">Resolved today</p>
                <p className="text-lg font-semibold tabular-nums">
                  {current.resolved_today}
                </p>
              </div>
            </div>

            <div className="rounded-md border px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">Effective today</p>
              <p className="font-medium tabular-nums">
                {current.resolved_today} / {current.quota_limit}
                <span className="text-muted-foreground font-normal">
                  {" "}
                  · {current.remaining} left
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clerk-base-quota">Base daily quota</Label>
              <div className="flex gap-2">
                <Input
                  id="clerk-base-quota"
                  type="number"
                  min={1}
                  value={baseQuotaInput}
                  onChange={(e) => setBaseQuotaInput(e.target.value)}
                />
                <Button onClick={() => void handleSaveBaseQuota()} disabled={busy}>
                  {savingBase ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="clerk-override-quota">Today&apos;s override</Label>
              <Input
                id="clerk-override-quota"
                type="number"
                min={1}
                placeholder="Leave empty to use base quota"
                value={overrideInput}
                onChange={(e) => setOverrideInput(e.target.value)}
              />
              <Input
                placeholder="Reason (optional)"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
              />
              <div className="flex gap-2">
                <Button
                  className="flex-1"
                  onClick={() => void handleSaveOverride()}
                  disabled={busy}
                >
                  {savingOverride ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Apply override"
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void handleClearOverride()}
                  disabled={busy || !current.quota_overridden}
                >
                  Clear
                </Button>
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Create or deactivate accounts in{" "}
              <Link href="/users" className="underline underline-offset-2">
                Users
              </Link>
              .
            </p>
          </div>
        ) : null}

        <SheetFooter>
          <Button
            variant="destructive"
            onClick={() => void handleReleaseClerk()}
            disabled={!current || busy}
          >
            {releasing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Releasing…
              </>
            ) : (
              "Release all batches"
            )}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
