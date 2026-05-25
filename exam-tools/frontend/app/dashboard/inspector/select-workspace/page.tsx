"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import {
  InspectorWorkspacePicker,
  InspectorWorkspacePickerSkeleton,
} from "@/components/inspector-workspace-picker";
import { RoleGuard } from "@/components/role-guard";
import { getMyInspectorPostings, getStaffDefaultExamination, type MyInspectorPostingRow } from "@/lib/api";
import {
  getInspectorPostingIdFromToken,
  getStoredToken,
  parseJwtPayload,
  selectInspectorPosting,
} from "@/lib/auth";
import { primaryButtonClass } from "@/lib/form-classes";
import { inspectorWorkspacePickerCopy } from "@/lib/inspector-posting-ui";
import { cn } from "@/lib/utils";

function InspectorSelectWorkspaceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isSwitch = searchParams.get("switch") === "1";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [postings, setPostings] = useState<MyInspectorPostingRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);

  const bootstrap = useCallback(async () => {
    setError(null);
    const token = getStoredToken();
    if (!token) {
      router.replace("/login/inspector");
      return;
    }
    const jwt = parseJwtPayload(token);
    if (jwt?.inspector_posting_id && !isSwitch) {
      router.replace("/dashboard/inspector");
      return;
    }
    try {
      const exam = await getStaffDefaultExamination();
      const examId = exam.id;
      const res = await getMyInspectorPostings(examId);
      setPostings(res.items);
      if (res.items.length === 0) {
        setError("You have no postings for the current examination.");
      } else if (res.items.length === 1 && !isSwitch) {
        await selectInspectorPosting(res.items[0].id);
        router.replace("/dashboard/inspector");
        return;
      } else {
        const jwtId = getInspectorPostingIdFromToken();
        const initial =
          jwtId && res.items.some((p) => p.id === jwtId)
            ? jwtId
            : (res.items[0]?.id ?? "");
        setSelectedId(initial);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load postings");
    } finally {
      setLoading(false);
    }
  }, [router, isSwitch]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  async function onConfirm() {
    if (!selectedId.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await selectInspectorPosting(selectedId.trim());
      router.replace("/dashboard/inspector");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save workspace");
    } finally {
      setBusy(false);
    }
  }

  const pageTitle = isSwitch
    ? inspectorWorkspacePickerCopy.switchTitle
    : inspectorWorkspacePickerCopy.selectTitle;
  const description = isSwitch
    ? inspectorWorkspacePickerCopy.switchDescription
    : inspectorWorkspacePickerCopy.selectDescription;

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title={pageTitle} staffRole="inspector">
        <div className="mx-auto max-w-lg px-0 pb-24 sm:pb-8">
          {loading ? (
            <InspectorWorkspacePickerSkeleton />
          ) : error && postings.length === 0 ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : postings.length > 1 || (isSwitch && postings.length >= 1) ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">{description}</p>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <InspectorWorkspacePicker
                postings={postings}
                selectedId={selectedId}
                onSelect={setSelectedId}
                disabled={busy}
                footer={
                  <button
                    type="button"
                    onClick={() => void onConfirm()}
                    disabled={busy || !selectedId}
                    className={cn(primaryButtonClass, "min-h-11 w-full")}
                  >
                    {busy
                      ? "Continuing…"
                      : isSwitch
                        ? inspectorWorkspacePickerCopy.confirmSwitch
                        : inspectorWorkspacePickerCopy.continue}
                  </button>
                }
              />
            </div>
          ) : null}
        </div>
      </DashboardShell>
    </RoleGuard>
  );
}

export default function InspectorSelectWorkspacePage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <InspectorSelectWorkspaceContent />
    </Suspense>
  );
}
