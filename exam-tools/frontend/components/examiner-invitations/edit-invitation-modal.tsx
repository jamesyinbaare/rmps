"use client";

import { EXAMINER_TYPE_LABELS, EXAMINER_TYPE_OPTIONS, STATUS_LABELS } from "@/components/examiner-invitations/constants";
import { InvitationModalShell } from "@/components/examiner-invitations/invitation-modal-shell";
import { Button } from "@/components/ui/button";
import type { ExaminerInvitationRow, ExaminerTypeApi } from "@/lib/api";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import { displaySubjectCode } from "@/lib/script-control-completion";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  busy: boolean;
  error: string | null;
  invitation: ExaminerInvitationRow | null;
  name: string;
  examinerType: ExaminerTypeApi;
  onClose: () => void;
  onSubmit: () => void;
  onNameChange: (value: string) => void;
  onExaminerTypeChange: (value: ExaminerTypeApi) => void;
};

export function EditInvitationModal({
  open,
  busy,
  error,
  invitation,
  name,
  examinerType,
  onClose,
  onSubmit,
  onNameChange,
  onExaminerTypeChange,
}: Props) {
  if (!open || !invitation) return null;

  const subjectLabel = displaySubjectCode(invitation);
  const statusLabel = STATUS_LABELS[invitation.status] ?? invitation.status;

  return (
    <InvitationModalShell
      title="Edit name & role"
      titleId="ei-edit-title"
      canClose={!busy}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={busy || !name.trim()} onClick={onSubmit}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-muted-foreground">
        Updates the invitation
        {invitation.status === "accepted" && invitation.examiner_id
          ? " and the linked roster entry"
          : ""}
        . Phone, subject, and region stay unchanged.
      </p>

      {error ? (
        <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <dl className="mt-4 grid gap-2 rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Subject</dt>
          <dd className="font-medium text-foreground">{subjectLabel}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Phone</dt>
          <dd className="font-medium text-foreground">{invitation.phone_number}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-muted-foreground">Status</dt>
          <dd className="font-medium text-foreground">{statusLabel}</dd>
        </div>
      </dl>

      <div className="mt-4 space-y-4">
        <div>
          <label className={formLabelClass} htmlFor="ei-edit-name">
            Name
          </label>
          <input
            id="ei-edit-name"
            className={cn(formInputClass, "mt-1")}
            value={name}
            disabled={busy}
            onChange={(e) => onNameChange(e.target.value)}
          />
        </div>
        <div>
          <label className={formLabelClass} htmlFor="ei-edit-role">
            Role
          </label>
          <select
            id="ei-edit-role"
            className={cn(formInputClass, "mt-1")}
            value={examinerType}
            disabled={busy}
            onChange={(e) => onExaminerTypeChange(e.target.value as ExaminerTypeApi)}
          >
            {EXAMINER_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {EXAMINER_TYPE_LABELS[option.value]}
              </option>
            ))}
          </select>
        </div>
      </div>
    </InvitationModalShell>
  );
}
