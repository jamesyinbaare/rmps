"use client";

import { useEffect, useMemo, useState } from "react";
import type { DuplicateCandidateSummary, DuplicateMatchGroup } from "@/types";
import {
  deleteSchoolCandidate,
  getPhotoFile,
  markCandidatesNotDuplicates,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  feePaymentStatusLabel,
  registrationStatusBadgeClass,
  registrationStatusLabel,
} from "@/lib/registration-status";
import { registrationTypeLabel } from "@/lib/school-registration";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  ShieldCheck,
  Trash2,
  User,
} from "lucide-react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: DuplicateMatchGroup[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onChanged: () => Promise<void> | void;
};

function formatDob(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function displayName(c: DuplicateCandidateSummary): string {
  return c.name || `${c.firstname} ${c.lastname}`.trim();
}

function subjectsLabel(c: DuplicateCandidateSummary): string {
  const sels = c.subject_selections || [];
  if (!sels.length) return "—";
  return sels.map((s) => s.subject_code).join(", ");
}

type FieldKey =
  | "name"
  | "dob"
  | "gender"
  | "programme"
  | "reg"
  | "index"
  | "status"
  | "fee"
  | "type"
  | "email"
  | "phone"
  | "national_id"
  | "subjects";

function fieldValue(c: DuplicateCandidateSummary, key: FieldKey): string {
  switch (key) {
    case "name":
      return displayName(c);
    case "dob":
      return formatDob(c.date_of_birth);
    case "gender":
      return c.gender || "—";
    case "programme":
      return c.programme_code || (c.programme_id != null ? String(c.programme_id) : "—");
    case "reg":
      return c.registration_number || "—";
    case "index":
      return c.index_number || "—";
    case "status":
      return registrationStatusLabel(c.registration_status);
    case "fee":
      return feePaymentStatusLabel(c.fee_payment_status);
    case "type":
      return registrationTypeLabel(c.registration_type);
    case "email":
      return c.contact_email || "—";
    case "phone":
      return c.contact_phone || "—";
    case "national_id":
      return c.national_id || "—";
    case "subjects":
      return subjectsLabel(c);
  }
}

const PRIMARY_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "name", label: "Full name" },
  { key: "dob", label: "Date of birth" },
  { key: "programme", label: "Programme" },
  { key: "reg", label: "Reg. number" },
];

const SECONDARY_FIELDS: { key: FieldKey; label: string }[] = [
  { key: "gender", label: "Gender" },
  { key: "index", label: "Index number" },
  { key: "status", label: "Status" },
  { key: "fee", label: "Fee" },
  { key: "type", label: "Type" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "national_id", label: "National ID" },
  { key: "subjects", label: "Subjects" },
];

function FieldList({
  candidate,
  other,
  fields,
}: {
  candidate: DuplicateCandidateSummary;
  other: DuplicateCandidateSummary | null;
  fields: { key: FieldKey; label: string }[];
}) {
  return (
    <dl className="space-y-2">
      {fields.map(({ key, label }) => {
        const value = fieldValue(candidate, key);
        const differs = other != null && fieldValue(other, key) !== value;
        const same = other != null && !differs;
        return (
          <div key={key} className="grid grid-cols-[6.5rem_1fr] gap-2 text-sm">
            <dt
              className={cn(
                "text-xs",
                same ? "text-muted-foreground/70" : "text-muted-foreground"
              )}
            >
              {label}
            </dt>
            <dd
              className={cn(
                "break-words text-sm",
                differs &&
                  "rounded-md bg-amber-50 px-1.5 py-0.5 font-medium dark:bg-amber-950/40",
                same && "text-muted-foreground"
              )}
            >
              {key === "status" ? (
                <Badge
                  variant="secondary"
                  className={cn(
                    "border-0 text-xs",
                    registrationStatusBadgeClass(candidate.registration_status)
                  )}
                >
                  {value}
                </Badge>
              ) : (
                value
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function CandidateColumn({
  candidate,
  other,
  photoUrl,
  photoLoading,
  busy,
  onRequestRemove,
}: {
  candidate: DuplicateCandidateSummary;
  other: DuplicateCandidateSummary | null;
  photoUrl: string | null;
  photoLoading: boolean;
  busy: boolean;
  onRequestRemove: () => void;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-none">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold tracking-tight">
            {displayName(candidate)}
          </div>
          <div className="mt-1 font-mono text-xs text-muted-foreground">
            {candidate.registration_number}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge
              variant="secondary"
              className={cn(
                "border-0 text-xs",
                registrationStatusBadgeClass(candidate.registration_status)
              )}
            >
              {registrationStatusLabel(candidate.registration_status)}
            </Badge>
            <Badge variant="outline" className="text-xs">
              {feePaymentStatusLabel(candidate.fee_payment_status)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="flex h-44 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/20">
        {photoLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={displayName(candidate)}
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex flex-col items-center gap-1 text-muted-foreground">
            <User className="h-10 w-10 opacity-60" />
            <span className="text-xs">No photo</span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <FieldList candidate={candidate} other={other} fields={PRIMARY_FIELDS} />
        <div className="border-t border-border pt-3">
          <FieldList candidate={candidate} other={other} fields={SECONDARY_FIELDS} />
        </div>
      </div>

      <div className="mt-auto space-y-2 border-t border-border pt-3">
        {!candidate.can_remove && candidate.remove_blocked_reason && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {candidate.remove_blocked_reason}
          </p>
        )}
        <Button
          variant="destructive"
          className="w-full"
          disabled={!candidate.can_remove || busy}
          title={
            candidate.can_remove
              ? "Remove this registration"
              : candidate.remove_blocked_reason || "Cannot remove"
          }
          onClick={onRequestRemove}
        >
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Remove duplicate
        </Button>
      </div>
    </div>
  );
}

export function DuplicateCompareDialog({
  open,
  onOpenChange,
  groups,
  activeIndex,
  onActiveIndexChange,
  onChanged,
}: Props) {
  const group = groups[activeIndex] ?? null;
  const candidates = group?.candidates ?? [];
  const [leftId, setLeftId] = useState<number | null>(null);
  const [rightId, setRightId] = useState<number | null>(null);
  const [photos, setPhotos] = useState<Record<number, string | null>>({});
  const [photoLoading, setPhotoLoading] = useState<Record<number, boolean>>({});
  const [pendingRemove, setPendingRemove] = useState<DuplicateCandidateSummary | null>(
    null
  );
  const [pendingDismiss, setPendingDismiss] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!group || !open) return;
    const ids = group.candidates.map((c) => c.id);
    setLeftId(ids[0] ?? null);
    setRightId(ids[1] ?? ids[0] ?? null);
  }, [group?.group_id, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !group) return;
    let cancelled = false;
    const urlsToRevoke: string[] = [];

    async function loadPhotos() {
      for (const c of group!.candidates) {
        if (!c.has_photo) {
          if (!cancelled) setPhotos((prev) => ({ ...prev, [c.id]: null }));
          continue;
        }
        if (!cancelled) setPhotoLoading((prev) => ({ ...prev, [c.id]: true }));
        try {
          const url = await getPhotoFile(c.id);
          if (url) urlsToRevoke.push(url);
          if (!cancelled) setPhotos((prev) => ({ ...prev, [c.id]: url }));
        } catch {
          if (!cancelled) setPhotos((prev) => ({ ...prev, [c.id]: null }));
        } finally {
          if (!cancelled) setPhotoLoading((prev) => ({ ...prev, [c.id]: false }));
        }
      }
    }

    void loadPhotos();
    return () => {
      cancelled = true;
      urlsToRevoke.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [open, group?.group_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (activeIndex > 0) onActiveIndexChange(activeIndex - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (activeIndex < groups.length - 1) onActiveIndexChange(activeIndex + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeIndex, groups.length, onActiveIndexChange]);

  const left = useMemo(
    () => candidates.find((c) => c.id === leftId) ?? null,
    [candidates, leftId]
  );
  const right = useMemo(
    () => candidates.find((c) => c.id === rightId) ?? null,
    [candidates, rightId]
  );

  async function confirmRemove() {
    if (!pendingRemove) return;
    setBusy(true);
    try {
      await deleteSchoolCandidate(pendingRemove.id);
      toast.success(`Removed ${displayName(pendingRemove)}`);
      setPendingRemove(null);
      await onChanged();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to remove registration";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDismiss() {
    if (!left || !right || left.id === right.id) return;
    setBusy(true);
    try {
      await markCandidatesNotDuplicates(left.id, right.id);
      toast.success("Marked as not duplicates");
      setPendingDismiss(false);
      await onChanged();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to mark as not duplicates";
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const scorePct =
    group != null ? Math.round(Math.min(1, Math.max(0, group.best_score)) * 100) : 0;
  const canGoPrev = activeIndex > 0;
  const canGoNext = activeIndex < groups.length - 1;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
          <div className="border-b border-border py-4 pl-6 pr-12">
            <DialogHeader className="space-y-3 text-left">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <DialogTitle className="text-lg">Possible duplicate</DialogTitle>
                  <DialogDescription asChild>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {group ? (
                        <>
                          <Badge variant="secondary">{scorePct}% match</Badge>
                          {group.match_reasons.map((r) => (
                            <Badge key={r} variant="outline" className="text-xs">
                              {r.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </>
                      ) : (
                        "Side-by-side comparison"
                      )}
                    </div>
                  </DialogDescription>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!canGoPrev}
                    onClick={() => onActiveIndexChange(activeIndex - 1)}
                    aria-label="Previous duplicate group"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="min-w-[4.5rem] text-center text-sm tabular-nums text-muted-foreground">
                    {groups.length ? `${activeIndex + 1} of ${groups.length}` : "0 of 0"}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={!canGoNext}
                    onClick={() => onActiveIndexChange(activeIndex + 1)}
                    aria-label="Next duplicate group"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4">
            {candidates.length > 2 && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Left</label>
                  <Select
                    value={leftId != null ? String(leftId) : undefined}
                    onValueChange={(v) => setLeftId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {displayName(c)} ({c.registration_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Right</label>
                  <Select
                    value={rightId != null ? String(rightId) : undefined}
                    onValueChange={(v) => setRightId(Number(v))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {candidates.map((c) => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {displayName(c)} ({c.registration_number})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {left && right ? (
              <div className="grid gap-4 md:grid-cols-2">
                <CandidateColumn
                  candidate={left}
                  other={right}
                  photoUrl={photos[left.id] ?? null}
                  photoLoading={!!photoLoading[left.id]}
                  busy={busy}
                  onRequestRemove={() => setPendingRemove(left)}
                />
                <CandidateColumn
                  candidate={right}
                  other={left}
                  photoUrl={photos[right.id] ?? null}
                  photoLoading={!!photoLoading[right.id]}
                  busy={busy}
                  onRequestRemove={() => setPendingRemove(right)}
                />
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No candidates left in this group.
              </p>
            )}
          </div>

          {left && right && left.id !== right.id && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/20 px-6 py-3">
              <p className="text-xs text-muted-foreground">
                Differing fields are highlighted. Use arrows to review other groups.
              </p>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setPendingDismiss(true)}
              >
                <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                Not a duplicate
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingRemove != null}
        onOpenChange={(next) => {
          if (!next && !busy) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove duplicate registration?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes{" "}
              <span className="font-medium text-foreground">
                {pendingRemove ? displayName(pendingRemove) : ""}
              </span>{" "}
              ({pendingRemove?.registration_number}). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmRemove();
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removing…
                </>
              ) : (
                "Remove duplicate"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDismiss}
        onOpenChange={(next) => {
          if (!next && !busy) setPendingDismiss(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as not duplicates?</AlertDialogTitle>
            <AlertDialogDescription>
              {left && right ? (
                <>
                  <span className="font-medium text-foreground">
                    {displayName(left)}
                  </span>{" "}
                  and{" "}
                  <span className="font-medium text-foreground">
                    {displayName(right)}
                  </span>{" "}
                  will stop appearing as a pair. Editing either registration will
                  clear this mark.
                </>
              ) : (
                "These candidates will stop appearing as a pair."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void confirmDismiss();
              }}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Mark as not duplicates"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
