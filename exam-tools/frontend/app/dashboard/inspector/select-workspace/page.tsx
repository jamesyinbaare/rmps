"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { getMyInspectorPostings, getStaffDefaultExamination, type MyInspectorPostingRow } from "@/lib/api";
import { getStoredToken, parseJwtPayload, selectInspectorPosting } from "@/lib/auth";
import { formInputClass, formLabelClass, primaryButtonClass } from "@/lib/form-classes";

function postingLabel(p: MyInspectorPostingRow): string {
  return `${p.center_name} (${p.center_code}) — ${p.subject_scope}`;
}

export default function InspectorSelectWorkspacePage() {
  const router = useRouter();
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
    if (jwt?.inspector_posting_id) {
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
      } else if (res.items.length === 1) {
        await selectInspectorPosting(res.items[0].id);
        router.replace("/dashboard/inspector");
        return;
      } else {
        setSelectedId(res.items[0]?.id ?? "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load postings");
    } finally {
      setLoading(false);
    }
  }, [router]);

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

  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <DashboardShell title="Select workspace" staffRole="inspector">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : error && postings.length === 0 ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : postings.length > 1 ? (
          <div className="mx-auto max-w-lg space-y-4">
            <p className="text-sm text-muted-foreground">
              You have been assigned to multiple examination centres. Select your posting below, then continue.
            </p>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <div>
              <label htmlFor="inspector-workspace" className={formLabelClass}>
                Posting
              </label>
              <select
                id="inspector-workspace"
                className={formInputClass}
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {postings.map((p) => (
                  <option key={p.id} value={p.id}>
                    {postingLabel(p)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={busy || !selectedId}
              className={primaryButtonClass}
            >
              {busy ? "Continuing…" : "Continue"}
            </button>
          </div>
        ) : null}
      </DashboardShell>
    </RoleGuard>
  );
}
