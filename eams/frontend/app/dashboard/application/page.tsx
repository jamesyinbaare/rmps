"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MultiStepApplicationForm } from "@/components/applications/MultiStepApplicationForm";
import {
  createApplication,
  getApplications,
  getApplication,
  updateApplication,
  submitApplication,
  logout,
} from "@/lib/api";
import { toast } from "sonner";
import type {
  ExaminerApplicationCreate,
  ExaminerApplicationResponse,
  ExaminerApplicationUpdate,
} from "@/types";

export default function ApplicationFlowPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState<ExaminerApplicationResponse | null>(null);
  const [draft, setDraft] = useState<ExaminerApplicationResponse | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        const apps = await getApplications();
        const submittedApp = apps.find(
          (a) =>
            a.status === "SUBMITTED" ||
            a.status === "UNDER_REVIEW" ||
            a.status === "ACCEPTED"
        );
        const draftApp = apps.find((a) => a.status === "DRAFT");
        if (submittedApp) {
          setSubmitted(submittedApp);
          router.replace(`/dashboard/profile/${submittedApp.examiner_id}`);
          return;
        }
        if (draftApp) {
          setDraft(draftApp);
          setDraftId(draftApp.id);
        }
      } catch (e) {
        console.error(e);
        toast.error("Failed to load applications");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [router]);

  const handleCreateDraft = async (data: ExaminerApplicationCreate): Promise<string> => {
    const app = await createApplication(data);
    setDraft(app);
    setDraftId(app.id);
    return app.id;
  };

  const handleSaveDraft = async (
    data: ExaminerApplicationUpdate,
    step: number
  ): Promise<void> => {
    if (!draftId) {
      throw new Error("No draft ID available");
    }
    setSaving(true);
    try {
      const payloadToSend = { ...data, last_completed_step: step };
      const updated = await updateApplication(draftId, payloadToSend);
      setDraft(updated);
    } catch (error) {
      // Re-throw error so caller can handle it
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitApplication = async (): Promise<void> => {
    if (!draftId) return;
    setLoading(true);
    try {
      const res = await submitApplication(draftId);
      toast.success("Application submitted successfully");
      const app = await getApplication(draftId);
      router.replace(`/dashboard/profile/${app.examiner_id}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submit failed";
      toast.error(msg);
      if (msg.toLowerCase().includes("payment")) {
        // could navigate to payment step
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAndExit = async () => {
    try {
      await logout();
      toast.success("Logged out. Sign in again to continue.");
      router.replace("/login");
    } catch {
      router.replace("/login");
    }
  };

  if (loading && !draft && !submitted) {
    return <div className="p-6">Loading…</div>;
  }

  if (submitted) {
    return null;
  }

  const initialStep =
    draft?.last_completed_step != null
      ? Math.min(Math.max(1, draft.last_completed_step + 1), 10)
      : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">
          {draft ? "Continue your application" : "Examiner application"}
        </h1>
        <p className="text-muted-foreground">
          {draft
            ? "Pick up where you left off."
            : "Complete the form step by step. You can save and continue later."}
        </p>
      </div>
      <MultiStepApplicationForm
        draftId={draftId}
        initialData={draft ?? undefined}
        initialStep={initialStep}
        onCreateDraft={handleCreateDraft}
        onSaveDraft={handleSaveDraft}
        onSubmitApplication={handleSubmitApplication}
        onSaveAndExit={handleSaveAndExit}
        loading={loading}
        saving={saving}
      />
    </div>
  );
}
