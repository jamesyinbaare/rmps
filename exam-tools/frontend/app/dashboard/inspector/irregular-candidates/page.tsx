"use client";

import { Camera, Check, Download, Eye, ImageIcon, Pencil, Search, Ticket, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { RoleGuard } from "@/components/role-guard";
import { SearchableCombobox } from "@/components/searchable-combobox";
import { TypeToDeleteConfirmModal } from "@/components/type-to-delete-confirm-modal";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formInputClass, formLabelClass } from "@/lib/form-classes";
import {
  createInspectorIrregularCandidate,
  deleteInspectorIrregularCandidate,
  downloadInspectorIrregularCandidatePhotograph,
  downloadInspectorIrregularCandidateVoucher,
  fetchInspectorIrregularCandidateImageObjectUrl,
  getIrregularCandidateProgrammeSubjectRequirements,
  getIrregularCandidatesStatus,
  getMyInspectorPostings,
  getStaffDefaultExamination,
  listInspectorIrregularCandidates,
  listIrregularCandidateProgrammes,
  updateInspectorIrregularCandidate,
  type Examination,
  type IrregularCandidate,
  type IrregularCandidateGender,
  type IrregularCandidateProgramme,
  type ProgrammeSubjectRequirements,
  type ProgrammeSubjectRow,
} from "@/lib/api";

const GENDER_OPTIONS: IrregularCandidateGender[] = ["Male", "Female"];
import { getMe, inspectorMustPickWorkspaceGlobally, pickInspectorPostingId } from "@/lib/auth";
import { cn } from "@/lib/utils";

type ImagePreviewKind = "photograph" | "voucher";

type ImagePreviewState = {
  candidateId: number;
  candidateName: string;
  kind: ImagePreviewKind;
};

const btnPrimary =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:text-sm";
const btnSecondary =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-input-border bg-background px-4 text-base font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:w-auto sm:text-sm";
const btnDanger =
  "inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-destructive/50 bg-background px-4 text-base font-medium text-destructive transition-colors hover:bg-destructive/10 focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:text-sm";
const btnFilePicker =
  "inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-input-border bg-muted/40 px-4 text-base font-medium text-foreground transition-colors hover:bg-muted focus-within:outline-none focus-within:ring-2 focus-within:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 sm:text-sm";
const panelClass = "rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5";
const mobileInputClass = `${formInputClass} min-h-11 text-base sm:text-sm`;

type ListSort = "newest" | "name";

function candidateDisplayName(c: IrregularCandidate): string {
  return [c.first_name, c.other_name, c.last_name].filter(Boolean).join(" ");
}

function candidateSearchHaystack(c: IrregularCandidate): string {
  const subjects = c.subjects.map((s) => `${s.subject_code} ${s.subject_name}`).join(" ");
  return [
    candidateDisplayName(c),
    c.phone_number,
    c.programme_code,
    c.programme_name,
    subjects,
  ]
    .join(" ")
    .toLowerCase();
}

function matchesCandidateSearch(c: IrregularCandidate, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return candidateSearchHaystack(c).includes(q);
}

function sortCandidates(items: IrregularCandidate[], sort: ListSort): IrregularCandidate[] {
  const copy = [...items];
  if (sort === "newest") {
    copy.sort((a, b) => {
      const byDate = b.created_at.localeCompare(a.created_at);
      return byDate !== 0 ? byDate : b.id - a.id;
    });
    return copy;
  }
  copy.sort((a, b) => {
    const last = a.last_name.localeCompare(b.last_name, undefined, { sensitivity: "base" });
    if (last !== 0) return last;
    const first = a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" });
    if (first !== 0) return first;
    return a.id - b.id;
  });
  return copy;
}

function formatRecordedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function formatDateOfBirth(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

type FormState = {
  first_name: string;
  last_name: string;
  other_name: string;
  gender: IrregularCandidateGender | "";
  date_of_birth: string;
  phone_number: string;
  guardian_name: string;
  guardian_phone_number: string;
  ghanapost_gps_address: string;
  programme_id: string;
  subject_ids: number[];
  photograph: File | null;
  voucher: File | null;
};

function emptyForm(): FormState {
  return {
    first_name: "",
    last_name: "",
    other_name: "",
    gender: "",
    date_of_birth: "",
    phone_number: "",
    guardian_name: "",
    guardian_phone_number: "",
    ghanapost_gps_address: "",
    programme_id: "",
    subject_ids: [],
    photograph: null,
    voucher: null,
  };
}

export default function InspectorIrregularCandidatesPage() {
  return (
    <RoleGuard expectedRole="INSPECTOR" loginHref="/login/inspector">
      <IrregularCandidatesClient />
    </RoleGuard>
  );
}

function IrregularCandidatesClient() {
  const router = useRouter();
  const [exam, setExam] = useState<Examination | null>(null);
  const [postingId, setPostingId] = useState<string | null>(null);
  const [centreLabel, setCentreLabel] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [items, setItems] = useState<IrregularCandidate[]>([]);
  const [programmes, setProgrammes] = useState<IrregularCandidateProgramme[]>([]);
  const [requirements, setRequirements] = useState<ProgrammeSubjectRequirements | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewingId, setViewingId] = useState<number | null>(null);
  const [existingPhotoUrl, setExistingPhotoUrl] = useState<string | null>(null);
  const [existingVoucherUrl, setExistingVoucherUrl] = useState<string | null>(null);
  const [listSearch, setListSearch] = useState("");
  const [listSort, setListSort] = useState<ListSort>("newest");
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imagePreviewLoading, setImagePreviewLoading] = useState(false);
  const [imagePreviewError, setImagePreviewError] = useState<string | null>(null);
  const [imageDownloading, setImageDownloading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<IrregularCandidate | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const refresh = useCallback(async (examId: number, pid: string | null) => {
    const status = await getIrregularCandidatesStatus(examId, pid);
    setEnabled(status.enabled);
    if (!status.enabled) {
      setItems([]);
      setProgrammes([]);
      return;
    }
    const [listRes, programmeRes] = await Promise.all([
      listInspectorIrregularCandidates(examId, pid),
      listIrregularCandidateProgrammes(examId, pid),
    ]);
    setItems(Array.isArray(listRes.items) ? listRes.items : []);
    setProgrammes(Array.isArray(programmeRes) ? programmeRes : []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        await getMe();
        const defaultExam = await getStaffDefaultExamination();
        const postingsRes = await getMyInspectorPostings(defaultExam.id);
        const postingItems = Array.isArray(postingsRes.items) ? postingsRes.items : [];
        if (inspectorMustPickWorkspaceGlobally(postingItems.length)) {
          router.replace("/dashboard/inspector/select-workspace");
          return;
        }
        const pid = pickInspectorPostingId(postingItems, postingId);
        const posting = postingItems.find((p) => p.id === pid);
        if (!cancelled) {
          setPostingId(pid);
          setExam(defaultExam);
          if (posting) {
            setCentreLabel(`${posting.center_name} (${posting.center_code})`);
          }
          await refresh(defaultExam.id, pid);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, refresh]);

  useEffect(() => {
    if (!exam || !form.programme_id || !enabled) {
      setRequirements(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const reqs = await getIrregularCandidateProgrammeSubjectRequirements(
          exam.id,
          Number(form.programme_id),
          postingId,
        );
        if (cancelled) return;
        setRequirements(reqs);
        // Do not pre-select any subjects.
      } catch (e) {
        if (!cancelled) {
          setActionError(e instanceof Error ? e.message : "Failed to load subjects");
          setRequirements(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exam, form.programme_id, postingId, enabled]);

  useEffect(() => {
    return () => {
      if (existingPhotoUrl) URL.revokeObjectURL(existingPhotoUrl);
      if (existingVoucherUrl) URL.revokeObjectURL(existingVoucherUrl);
    };
  }, [existingPhotoUrl, existingVoucherUrl]);

  useEffect(() => {
    if (!imagePreview || !exam) {
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    setImagePreviewLoading(true);
    setImagePreviewError(null);
    setImagePreviewUrl(null);
    (async () => {
      try {
        objectUrl = await fetchInspectorIrregularCandidateImageObjectUrl(
          exam.id,
          imagePreview.candidateId,
          imagePreview.kind,
          postingId,
        );
        if (cancelled) {
          URL.revokeObjectURL(objectUrl);
          return;
        }
        setImagePreviewUrl(objectUrl);
      } catch (e) {
        if (!cancelled) {
          setImagePreviewError(e instanceof Error ? e.message : "Failed to load image");
        }
      } finally {
        if (!cancelled) setImagePreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imagePreview, exam, postingId]);

  function revokeExistingPreviews() {
    if (existingPhotoUrl) URL.revokeObjectURL(existingPhotoUrl);
    if (existingVoucherUrl) URL.revokeObjectURL(existingVoucherUrl);
    setExistingPhotoUrl(null);
    setExistingVoucherUrl(null);
  }

  function openImagePreview(candidate: IrregularCandidate, kind: ImagePreviewKind) {
    setImagePreview({
      candidateId: candidate.id,
      candidateName: candidateDisplayName(candidate),
      kind,
    });
  }

  const closeImagePreview = useCallback(() => {
    setImagePreview(null);
    setImagePreviewUrl(null);
    setImagePreviewError(null);
    setImagePreviewLoading(false);
    setImageDownloading(false);
  }, []);

  async function downloadFromPreview() {
    if (!exam || !imagePreview) return;
    setImageDownloading(true);
    try {
      if (imagePreview.kind === "photograph") {
        await downloadInspectorIrregularCandidatePhotograph(
          exam.id,
          imagePreview.candidateId,
          postingId,
        );
      } else {
        await downloadInspectorIrregularCandidateVoucher(
          exam.id,
          imagePreview.candidateId,
          postingId,
        );
      }
    } catch (e) {
      setImagePreviewError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setImageDownloading(false);
    }
  }

  function toggleSubject(subject: ProgrammeSubjectRow) {
    setForm((prev) => {
      const selected = new Set(prev.subject_ids);
      if (selected.has(subject.subject_id)) {
        selected.delete(subject.subject_id);
      } else {
        selected.add(subject.subject_id);
      }
      return { ...prev, subject_ids: [...selected] };
    });
  }

  /** Optional core: one or none within the group (never two). */
  function toggleExclusiveSubject(subject: ProgrammeSubjectRow, groupSubjects: ProgrammeSubjectRow[]) {
    const groupIds = new Set(groupSubjects.map((s) => s.subject_id));
    setForm((prev) => {
      const selected = new Set(prev.subject_ids);
      if (selected.has(subject.subject_id)) {
        selected.delete(subject.subject_id);
        return { ...prev, subject_ids: [...selected] };
      }
      for (const id of groupIds) selected.delete(id);
      selected.add(subject.subject_id);
      return { ...prev, subject_ids: [...selected] };
    });
  }

  function startCreate() {
    revokeExistingPreviews();
    setViewingId(null);
    setEditingId(null);
    setForm(emptyForm());
    setRequirements(null);
    setShowForm(true);
    setActionError(null);
    setActionSuccess(null);
  }

  async function loadCandidateImagePreviews(candidateId: number) {
    if (!exam) return;
    revokeExistingPreviews();
    try {
      const [photoUrl, voucherUrl] = await Promise.all([
        fetchInspectorIrregularCandidateImageObjectUrl(
          exam.id,
          candidateId,
          "photograph",
          postingId,
        ),
        fetchInspectorIrregularCandidateImageObjectUrl(
          exam.id,
          candidateId,
          "voucher",
          postingId,
        ),
      ]);
      setExistingPhotoUrl(photoUrl);
      setExistingVoucherUrl(voucherUrl);
    } catch {
      // Previews are optional; inspector can still open downloads from list.
    }
  }

  function startView(candidate: IrregularCandidate) {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setRequirements(null);
    setActionError(null);
    setViewingId(candidate.id);
    void loadCandidateImagePreviews(candidate.id);
  }

  async function startEdit(candidate: IrregularCandidate) {
    setViewingId(candidate.id);
    setEditingId(candidate.id);
    setForm({
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      other_name: candidate.other_name ?? "",
      gender: candidate.gender,
      date_of_birth: candidate.date_of_birth,
      phone_number: candidate.phone_number,
      guardian_name: candidate.guardian_name ?? "",
      guardian_phone_number: candidate.guardian_phone_number ?? "",
      ghanapost_gps_address: candidate.ghanapost_gps_address ?? "",
      programme_id: String(candidate.programme_id),
      subject_ids: candidate.subjects
        .map((s) => s.subject_id)
        .filter((id): id is number => id != null),
      photograph: null,
      voucher: null,
    });
    setShowForm(true);
    setActionError(null);
    setActionSuccess(null);
    await loadCandidateImagePreviews(candidate.id);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setRequirements(null);
    setActionError(null);
    if (viewingId != null) {
      void loadCandidateImagePreviews(viewingId);
    } else {
      revokeExistingPreviews();
    }
  }

  function closeView() {
    setViewingId(null);
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setRequirements(null);
    setActionError(null);
    revokeExistingPreviews();
  }

  async function confirmDeleteCandidate() {
    if (!exam || !pendingDelete) return;
    setDeleteBusy(true);
    setActionError(null);
    try {
      await deleteInspectorIrregularCandidate(exam.id, pendingDelete.id, postingId);
      const deletedId = pendingDelete.id;
      setPendingDelete(null);
      if (viewingId === deletedId) {
        closeView();
      }
      if (editingId === deletedId) {
        setShowForm(false);
        setEditingId(null);
        setForm(emptyForm());
        setRequirements(null);
        revokeExistingPreviews();
      }
      await refresh(exam.id, postingId);
      setActionSuccess("Irregular candidate deleted.");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!exam) return;
    setSaving(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      if (form.gender !== "Male" && form.gender !== "Female") {
        setActionError("Gender is required");
        setSaving(false);
        return;
      }
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        other_name: form.other_name.trim() || null,
        gender: form.gender,
        date_of_birth: form.date_of_birth,
        phone_number: form.phone_number.trim(),
        programme_id: Number(form.programme_id),
        subject_ids: form.subject_ids,
        guardian_name: form.guardian_name.trim() || null,
        guardian_phone_number: form.guardian_phone_number.trim() || null,
        ghanapost_gps_address: form.ghanapost_gps_address.trim() || null,
        photograph: form.photograph,
        voucher: form.voucher,
        clear_other_name: editingId != null && form.other_name.trim() === "",
        clear_guardian_name: editingId != null && form.guardian_name.trim() === "",
        clear_guardian_phone_number: editingId != null && form.guardian_phone_number.trim() === "",
        clear_ghanapost_gps_address: editingId != null && form.ghanapost_gps_address.trim() === "",
      };
      if (editingId == null) {
        await createInspectorIrregularCandidate(exam.id, payload, postingId);
        setActionSuccess("Irregular candidate recorded.");
      } else {
        await updateInspectorIrregularCandidate(exam.id, editingId, payload, postingId);
        setActionSuccess("Irregular candidate updated.");
      }
      await refresh(exam.id, postingId);
      closeForm();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    !saving &&
    form.first_name.trim() !== "" &&
    form.last_name.trim() !== "" &&
    (form.gender === "Male" || form.gender === "Female") &&
    form.date_of_birth !== "" &&
    form.phone_number.trim() !== "" &&
    form.programme_id !== "" &&
    form.subject_ids.length > 0 &&
    (editingId != null || (form.photograph != null && form.voucher != null));

  const programmeOptions = useMemo(
    () =>
      programmes.map((p) => ({
        value: String(p.id),
        label: `${p.code} — ${p.name}`,
      })),
    [programmes],
  );

  const displayedItems = useMemo(() => {
    const filtered = items.filter((c) => matchesCandidateSearch(c, listSearch));
    return sortCandidates(filtered, listSort);
  }, [items, listSearch, listSort]);

  const viewingCandidate = useMemo(
    () => (viewingId == null ? null : items.find((c) => c.id === viewingId) ?? null),
    [viewingId, items],
  );

  const searchActive = listSearch.trim().length > 0;
  const showList = !showForm && viewingCandidate == null;
  const showDetail = !showForm && viewingCandidate != null;

  return (
    <DashboardShell title="Irregular candidates" staffRole="inspector">
      <div
        className={cn(
          "mx-auto flex w-full flex-col gap-4 px-4 py-4 sm:px-6",
          showForm || showDetail ? "max-w-lg pb-28 sm:max-w-2xl" : "max-w-3xl lg:max-w-6xl",
        )}
      >
        {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {loadError ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
            {loadError}
          </p>
        ) : null}

        {!loading && !loadError && !enabled ? (
          <div className={panelClass}>
            <h2 className="text-lg font-semibold text-card-foreground">Not available</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Irregular candidate registration is turned off for this examination. Ask an administrator to
              enable it under inspector submission settings.
            </p>
          </div>
        ) : null}

        {!loading && !loadError && enabled && showList ? (
          <div className="flex flex-col gap-3">
            {actionSuccess ? (
              <p
                className="rounded-lg border border-success/40 bg-success/10 px-3 py-2.5 text-sm text-success"
                role="status"
              >
                {actionSuccess}
              </p>
            ) : null}
            {actionError ? (
              <p
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                role="alert"
              >
                {actionError}
              </p>
            ) : null}

            <div className={cn(panelClass, "overflow-hidden p-0 sm:p-0")}>
              <div className="flex items-start justify-between gap-2 border-b border-border px-3 py-2.5 sm:items-center sm:gap-3 sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:text-[11px]">
                    Examination centre
                    {exam ? (
                      <span className="font-normal normal-case tracking-normal text-muted-foreground">
                        {" "}
                        · {exam.exam_type} {exam.year}
                        {exam.exam_series ? ` ${exam.exam_series}` : ""}
                      </span>
                    ) : null}
                  </p>
                  <h2 className="mt-0.5 truncate text-sm font-semibold leading-snug text-card-foreground sm:text-lg">
                    {centreLabel || "Current centre"}
                  </h2>
                </div>
                <button
                  type="button"
                  className={cn(
                    btnPrimary,
                    "min-h-9 w-auto shrink-0 px-3 text-sm sm:min-h-11 sm:px-5",
                  )}
                  onClick={startCreate}
                >
                  <UserPlus className="mr-1.5 size-3.5 sm:mr-2 sm:size-4" aria-hidden />
                  <span className="sm:hidden">Add</span>
                  <span className="hidden sm:inline">Add candidate</span>
                </button>
              </div>

              {items.length === 0 ? (
                <div className="px-4 py-12 text-center sm:px-5">
                  <p className="text-sm font-medium text-foreground">No irregular candidates yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Record walk-in candidates for this centre. They appear here for review and editing.
                  </p>
                  <button
                    type="button"
                    className={cn(btnPrimary, "mx-auto mt-5 max-w-xs")}
                    onClick={startCreate}
                  >
                    <UserPlus className="mr-2 size-4" aria-hidden />
                    Register first candidate
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2.5 border-b border-border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
                    <div className="relative min-w-0 flex-1 sm:max-w-xs">
                      <Search
                        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <label className="sr-only" htmlFor="irr-list-search">
                        Search candidates
                      </label>
                      <input
                        id="irr-list-search"
                        type="search"
                        enterKeyHint="search"
                        autoComplete="off"
                        className={cn(
                          formInputClass,
                          "h-9 min-h-9 pl-8 pr-9 text-sm",
                        )}
                        placeholder="Search name, phone, programme…"
                        value={listSearch}
                        onChange={(e) => setListSearch(e.target.value)}
                      />
                      {searchActive ? (
                        <button
                          type="button"
                          className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Clear search"
                          onClick={() => setListSearch("")}
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:ml-auto">
                      <p className="text-xs text-muted-foreground" aria-live="polite">
                        {searchActive
                          ? `${displayedItems.length} of ${items.length}`
                          : `${items.length} recorded`}
                      </p>
                      <div
                        className="inline-flex rounded-md border border-border bg-background p-0.5"
                        role="group"
                        aria-label="Sort candidates"
                      >
                        {(
                          [
                            { value: "newest" as const, label: "Newest" },
                            { value: "name" as const, label: "A–Z" },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            className={cn(
                              "h-7 rounded px-2.5 text-xs font-medium transition-colors",
                              listSort === opt.value
                                ? "bg-muted text-foreground"
                                : "text-muted-foreground hover:text-foreground",
                            )}
                            aria-pressed={listSort === opt.value}
                            onClick={() => setListSort(opt.value)}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {displayedItems.length === 0 ? (
                    <div className="px-4 py-10 text-center">
                      <p className="text-sm font-medium text-foreground">
                        No candidates match “{listSearch.trim()}”
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Try another name, phone, programme code, or subject.
                      </p>
                      <button
                        type="button"
                        className={cn(btnSecondary, "mx-auto mt-4 w-auto")}
                        onClick={() => setListSearch("")}
                      >
                        Clear search
                      </button>
                    </div>
                  ) : (
                    <TooltipProvider delayDuration={350} skipDelayDuration={80}>
                      {/* Mobile list */}
                      <div className="divide-y divide-border md:hidden">
                        {displayedItems.map((c, index) => {
                          const name = candidateDisplayName(c);
                          const subjectCodes = c.subjects.map((s) => s.subject_code);
                          const subjectLabel = subjectCodes.join(", ") || "None";
                          const recorded = formatRecordedAt(c.created_at);
                          return (
                            <article key={c.id} className="bg-card px-3 py-3">
                              <header className="flex items-start gap-2.5">
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/80 bg-muted/40 text-xs font-semibold tabular-nums text-muted-foreground"
                                  aria-hidden
                                >
                                  {index + 1}
                                </span>
                                <button
                                  type="button"
                                  className="min-w-0 flex-1 rounded-lg text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                                  onClick={() => startView(c)}
                                  aria-label={`View ${name}`}
                                >
                                  <p className="truncate text-sm font-semibold leading-snug text-foreground">
                                    {name}
                                  </p>
                                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                                    <span className="font-mono text-foreground/80">{c.programme_code}</span>
                                    <span className="text-border"> · </span>
                                    <span title={c.programme_name}>{c.programme_name}</span>
                                  </p>
                                </button>
                              </header>

                              <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 pl-[2.375rem] text-xs">
                                <span className="flex min-w-0 items-baseline gap-1">
                                  <span className="shrink-0 font-medium text-muted-foreground">Tel</span>
                                  <span className="tabular-nums text-foreground">{c.phone_number}</span>
                                </span>
                                <span className="flex min-w-0 items-baseline gap-1" title={subjectLabel}>
                                  <span className="shrink-0 font-medium text-muted-foreground">Subj</span>
                                  <span className="font-medium tabular-nums text-foreground">
                                    {subjectCodes.length}
                                  </span>
                                </span>
                                {recorded ? (
                                  <span className="flex min-w-0 items-baseline gap-1">
                                    <span className="shrink-0 font-medium text-muted-foreground">On</span>
                                    <time dateTime={c.created_at} className="text-foreground">
                                      {recorded}
                                    </time>
                                  </span>
                                ) : null}
                              </p>

                              <div className="mt-2.5 flex items-center gap-2 pl-[2.375rem]">
                                <button
                                  type="button"
                                  className={cn(btnSecondary, "min-h-9 flex-1 text-sm")}
                                  onClick={() => startView(c)}
                                >
                                  <Eye className="mr-1.5 size-3.5" aria-hidden />
                                  View
                                </button>
                                <button
                                  type="button"
                                  className={cn(btnSecondary, "min-h-9 flex-1 text-sm")}
                                  onClick={() => void startEdit(c)}
                                >
                                  <Pencil className="mr-1.5 size-3.5" aria-hidden />
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-destructive/40 bg-background text-destructive hover:bg-destructive/10"
                                  aria-label={`Delete ${name}`}
                                  onClick={() => {
                                    setActionError(null);
                                    setPendingDelete(c);
                                  }}
                                >
                                  <Trash2 className="size-4" aria-hidden />
                                </button>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      {/* Desktop table */}
                      <div className="hidden border-t border-border md:block">
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[40rem] border-collapse text-sm">
                            <thead>
                              <tr className="border-b border-border bg-muted/40">
                                <th className="w-11 px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  #
                                </th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Name
                                </th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Phone
                                </th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Programme
                                </th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Subjects
                                </th>
                                <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  Recorded
                                </th>
                                <th className="sticky right-0 z-10 w-36 bg-muted/40 px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wider text-muted-foreground shadow-[-8px_0_16px_-12px] shadow-black/10">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                              {displayedItems.map((c, index) => {
                                const name = candidateDisplayName(c);
                                const subjectLabel =
                                  c.subjects.map((s) => s.subject_code).join(", ") || "—";
                                const recorded = formatRecordedAt(c.created_at);
                                return (
                                  <tr
                                    key={c.id}
                                    className="group/row bg-card transition-colors hover:bg-muted/25"
                                  >
                                    <td className="px-2 py-2.5 text-center text-xs tabular-nums text-muted-foreground">
                                      {index + 1}
                                    </td>
                                    <td className="max-w-[12rem] px-3 py-2.5 font-medium text-foreground" title={name}>
                                      <button
                                        type="button"
                                        className="block max-w-full truncate text-left hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
                                        onClick={() => startView(c)}
                                      >
                                        {name}
                                      </button>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-muted-foreground">
                                      {c.phone_number}
                                    </td>
                                    <td className="max-w-[14rem] px-3 py-2.5" title={`${c.programme_code} — ${c.programme_name}`}>
                                      <span className="font-mono text-xs text-foreground">{c.programme_code}</span>
                                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                        {c.programme_name}
                                      </span>
                                    </td>
                                    <td
                                      className="max-w-[11rem] truncate px-3 py-2.5 text-xs text-muted-foreground"
                                      title={subjectLabel}
                                    >
                                      {subjectLabel}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-muted-foreground">
                                      {recorded ? (
                                        <time dateTime={c.created_at}>{recorded}</time>
                                      ) : (
                                        "—"
                                      )}
                                    </td>
                                    <td className="sticky right-0 z-10 bg-card px-2 py-2 align-middle shadow-[-8px_0_16px_-12px] shadow-black/10 transition-colors group-hover/row:bg-muted/25">
                                      <div
                                        role="toolbar"
                                        aria-label={`Actions for ${name}`}
                                        className="flex justify-center gap-1.5 opacity-70 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                                      >
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              className="inline-flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
                                              aria-label={`View ${name}`}
                                              onClick={() => startView(c)}
                                            >
                                              <Eye className="size-3.5" aria-hidden />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">View</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              className="inline-flex size-9 items-center justify-center rounded-full border border-primary/25 bg-card text-primary shadow-sm hover:bg-primary hover:text-primary-foreground"
                                              aria-label={`Edit ${name}`}
                                              onClick={() => void startEdit(c)}
                                            >
                                              <Pencil className="size-3.5" aria-hidden />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">Edit</TooltipContent>
                                        </Tooltip>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <button
                                              type="button"
                                              className="inline-flex size-9 items-center justify-center rounded-full border border-destructive/25 bg-card text-destructive shadow-sm hover:bg-destructive hover:text-destructive-foreground"
                                              aria-label={`Delete ${name}`}
                                              onClick={() => {
                                                setActionError(null);
                                                setPendingDelete(c);
                                              }}
                                            >
                                              <Trash2 className="size-3.5" aria-hidden />
                                            </button>
                                          </TooltipTrigger>
                                          <TooltipContent side="top">Delete</TooltipContent>
                                        </Tooltip>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </TooltipProvider>
                  )}
                </>
              )}
            </div>
          </div>
        ) : null}

        {!loading && !loadError && enabled && showDetail && viewingCandidate ? (
          <div className="flex flex-col gap-3">
            {actionError ? (
              <p
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                role="alert"
              >
                {actionError}
              </p>
            ) : null}
            <CandidateDetailView
              candidate={viewingCandidate}
              centreLabel={centreLabel}
              photoUrl={existingPhotoUrl}
              voucherUrl={existingVoucherUrl}
              onBack={closeView}
              onEdit={() => void startEdit(viewingCandidate)}
              onDelete={() => {
                setActionError(null);
                setPendingDelete(viewingCandidate);
              }}
              onOpenPhoto={() => openImagePreview(viewingCandidate, "photograph")}
              onOpenVoucher={() => openImagePreview(viewingCandidate, "voucher")}
            />
          </div>
        ) : null}

        {!loading && !loadError && enabled && showForm ? (
          <form id="irregular-candidate-form" className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
            <div className={panelClass}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-card-foreground">
                    {editingId == null ? "Add candidate" : "Edit candidate"}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{centreLabel}</p>
                </div>
                <button type="button" className={cn(btnSecondary, "w-auto shrink-0 px-3")} onClick={closeForm}>
                  <X className="size-4" aria-hidden />
                  <span className="sr-only">Cancel</span>
                </button>
              </div>
              {actionError ? (
                <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
                  {actionError}
                </p>
              ) : null}
            </div>

            <section className={panelClass} aria-labelledby="irr-identity-heading">
              <h3 id="irr-identity-heading" className="text-sm font-semibold text-card-foreground">
                1. Candidate details
              </h3>
              <div className="mt-4 grid gap-3">
                <div>
                  <label className={formLabelClass} htmlFor="irr-first-name">
                    First name *
                  </label>
                  <input
                    id="irr-first-name"
                    required
                    autoComplete="given-name"
                    className={mobileInputClass}
                    value={form.first_name}
                    onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="irr-last-name">
                    Last name *
                  </label>
                  <input
                    id="irr-last-name"
                    required
                    autoComplete="family-name"
                    className={mobileInputClass}
                    value={form.last_name}
                    onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="irr-other-name">
                    Other name
                  </label>
                  <input
                    id="irr-other-name"
                    autoComplete="additional-name"
                    className={mobileInputClass}
                    value={form.other_name}
                    onChange={(e) => setForm((p) => ({ ...p, other_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="irr-gender">
                    Gender *
                  </label>
                  <select
                    id="irr-gender"
                    required
                    className={mobileInputClass}
                    value={form.gender}
                    onChange={(e) =>
                      setForm((p) => ({
                        ...p,
                        gender: e.target.value as IrregularCandidateGender | "",
                      }))
                    }
                  >
                    <option value="">Select gender…</option>
                    {GENDER_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="irr-dob">
                    Date of birth *
                  </label>
                  <input
                    id="irr-dob"
                    type="date"
                    required
                    className={mobileInputClass}
                    value={form.date_of_birth}
                    onChange={(e) => setForm((p) => ({ ...p, date_of_birth: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="irr-phone">
                    Phone *
                  </label>
                  <input
                    id="irr-phone"
                    required
                    inputMode="tel"
                    autoComplete="tel"
                    className={mobileInputClass}
                    value={form.phone_number}
                    onChange={(e) => setForm((p) => ({ ...p, phone_number: e.target.value }))}
                    placeholder="0XXXXXXXXX"
                  />
                </div>
              </div>
            </section>

            <section className={panelClass} aria-labelledby="irr-photos-heading">
              <h3 id="irr-photos-heading" className="text-sm font-semibold text-card-foreground">
                2. Photos
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the camera on this phone. You can retake until the image is clear.
              </p>
              <div className="mt-4 space-y-4">
                <PhotoCaptureCard
                  title="Candidate photograph *"
                  hint="Face the candidate. Fill most of the frame with their face."
                  captureMode="user"
                  file={form.photograph}
                  existingPreviewUrl={editingId != null && !form.photograph ? existingPhotoUrl : null}
                  required={editingId == null}
                  onFileChange={(file) => setForm((p) => ({ ...p, photograph: file }))}
                />
                <PhotoCaptureCard
                  title="Voucher photo *"
                  hint="Fill the frame with the voucher. Avoid glare and blur."
                  captureMode="environment"
                  file={form.voucher}
                  existingPreviewUrl={editingId != null && !form.voucher ? existingVoucherUrl : null}
                  required={editingId == null}
                  onFileChange={(file) => setForm((p) => ({ ...p, voucher: file }))}
                />
              </div>
            </section>

            <section className={panelClass} aria-labelledby="irr-subjects-heading">
              <h3 id="irr-subjects-heading" className="text-sm font-semibold text-card-foreground">
                3. Programme & subjects
              </h3>
              <div className="mt-4">
                <label className={formLabelClass} htmlFor="irr-programme">
                  Programme *
                </label>
                <p className="mb-1.5 text-xs text-muted-foreground">Search by code or name.</p>
                <SearchableCombobox
                  id="irr-programme"
                  options={programmeOptions}
                  value={form.programme_id}
                  onChange={(value) =>
                    setForm((p) => ({
                      ...p,
                      programme_id: value,
                      subject_ids: [],
                    }))
                  }
                  placeholder="Select programme…"
                  searchPlaceholder="Search programmes…"
                  emptyText="No programmes match."
                  widthClass="w-full"
                  showAllOption={false}
                />
              </div>

              {requirements ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Subjects *</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Select the subjects the candidate will write. Optional core allows one choice or none.
                      {form.subject_ids.length === 0 ? (
                        <span className="mt-1 block font-medium text-amber-800 dark:text-amber-200">
                          Choose at least one subject to continue.
                        </span>
                      ) : (
                        <span className="mt-1 block text-muted-foreground">
                          {form.subject_ids.length} selected
                        </span>
                      )}
                    </p>
                  </div>
                  {requirements.compulsory_core.length > 0 ? (
                    <SubjectToggleList
                      title="Core"
                      subjects={requirements.compulsory_core}
                      selected={form.subject_ids}
                      onToggle={toggleSubject}
                    />
                  ) : null}
                  {requirements.optional_core_groups.map((group) => (
                    <SubjectToggleList
                      key={group.choice_group_id}
                      title="Optional core"
                      hint="Select one or none"
                      subjects={group.subjects}
                      selected={form.subject_ids}
                      exclusive
                      onToggle={(subject) => toggleExclusiveSubject(subject, group.subjects)}
                    />
                  ))}
                  {requirements.electives.length > 0 ? (
                    <SubjectToggleList
                      title="Electives"
                      subjects={requirements.electives}
                      selected={form.subject_ids}
                      onToggle={toggleSubject}
                    />
                  ) : null}
                </div>
              ) : form.programme_id ? (
                <p className="mt-3 text-sm text-muted-foreground">Loading subjects…</p>
              ) : null}
            </section>

            <details className={panelClass}>
              <summary className="cursor-pointer text-sm font-semibold text-card-foreground">
                4. Optional details
              </summary>
              <p className="mt-1 text-xs text-muted-foreground">Guardian and GhanaPost GPS if available.</p>
              <div className="mt-4 grid gap-3">
                <div>
                  <label className={formLabelClass} htmlFor="irr-guardian-name">
                    Guardian name
                  </label>
                  <input
                    id="irr-guardian-name"
                    className={mobileInputClass}
                    value={form.guardian_name}
                    onChange={(e) => setForm((p) => ({ ...p, guardian_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="irr-guardian-phone">
                    Guardian phone
                  </label>
                  <input
                    id="irr-guardian-phone"
                    inputMode="tel"
                    className={mobileInputClass}
                    value={form.guardian_phone_number}
                    onChange={(e) => setForm((p) => ({ ...p, guardian_phone_number: e.target.value }))}
                  />
                </div>
                <div>
                  <label className={formLabelClass} htmlFor="irr-gps">
                    GhanaPost GPS address
                  </label>
                  <input
                    id="irr-gps"
                    className={mobileInputClass}
                    value={form.ghanapost_gps_address}
                    onChange={(e) => setForm((p) => ({ ...p, ghanapost_gps_address: e.target.value }))}
                    maxLength={50}
                    placeholder="e.g. GA-123-4567"
                  />
                </div>
              </div>
            </details>

            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 lg:static lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
              <div className="mx-auto flex max-w-lg gap-2 sm:max-w-2xl">
                <button type="button" className={btnSecondary} onClick={closeForm} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" form="irregular-candidate-form" className={btnPrimary} disabled={!canSave}>
                  {saving ? "Saving…" : editingId == null ? "Save candidate" : "Update candidate"}
                </button>
              </div>
            </div>
          </form>
        ) : null}
      </div>

      {imagePreview
        ? createPortal(
            <ImagePreviewModal
              kind={imagePreview.kind}
              candidateName={imagePreview.candidateName}
              url={imagePreviewUrl}
              loading={imagePreviewLoading}
              error={imagePreviewError}
              downloading={imageDownloading}
              onDownload={() => void downloadFromPreview()}
              onDismiss={closeImagePreview}
            />,
            document.body,
          )
        : null}

      {pendingDelete ? (
        <TypeToDeleteConfirmModal
          title="Delete irregular candidate?"
          titleId="delete-irregular-candidate-title"
          description={
            <>
              Remove{" "}
              <span className="font-medium text-foreground">
                {candidateDisplayName(pendingDelete)}
              </span>
              ? Photograph, voucher, and subject selections will be permanently deleted.
            </>
          }
          onCancel={() => !deleteBusy && setPendingDelete(null)}
          onConfirm={() => void confirmDeleteCandidate()}
          busy={deleteBusy}
        />
      ) : null}
    </DashboardShell>
  );
}

function DetailField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value?.trim() ? value : "—";
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{display}</dd>
    </div>
  );
}

function CandidateDetailView({
  candidate,
  centreLabel,
  photoUrl,
  voucherUrl,
  onBack,
  onEdit,
  onDelete,
  onOpenPhoto,
  onOpenVoucher,
}: {
  candidate: IrregularCandidate;
  centreLabel: string;
  photoUrl: string | null;
  voucherUrl: string | null;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onOpenPhoto: () => void;
  onOpenVoucher: () => void;
}) {
  const name = candidateDisplayName(candidate);
  const subjects =
    candidate.subjects.map((s) => `${s.subject_code} — ${s.subject_name}`).join(", ") || "—";
  const recorded = formatRecordedAt(candidate.created_at);

  return (
    <div className="flex flex-col gap-3 pb-20 sm:pb-4">
      <div className={panelClass}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Candidate details
            </p>
            <h2 className="mt-0.5 truncate text-lg font-semibold text-card-foreground">{name}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{centreLabel}</p>
          </div>
          <button
            type="button"
            className={cn(btnSecondary, "w-auto shrink-0 px-3")}
            onClick={onBack}
            aria-label="Back to list"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      <section className={panelClass} aria-labelledby="irr-detail-identity">
        <h3 id="irr-detail-identity" className="text-sm font-semibold text-card-foreground">
          Identity
        </h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <DetailField label="First name" value={candidate.first_name} />
          <DetailField label="Last name" value={candidate.last_name} />
          <DetailField label="Other name" value={candidate.other_name} />
          <DetailField label="Gender" value={candidate.gender} />
          <DetailField label="Date of birth" value={formatDateOfBirth(candidate.date_of_birth)} />
          <DetailField label="Phone" value={candidate.phone_number} />
          <DetailField label="Recorded" value={recorded || null} />
        </dl>
      </section>

      <section className={panelClass} aria-labelledby="irr-detail-photos">
        <h3 id="irr-detail-photos" className="text-sm font-semibold text-card-foreground">
          Photos
        </h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            className="overflow-hidden rounded-xl border border-border bg-muted/10 text-left transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={onOpenPhoto}
          >
            <p className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
              Photograph
            </p>
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt={`Photograph of ${name}`} className="aspect-[4/3] w-full object-contain bg-black/5" />
            ) : (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Camera className="size-5" aria-hidden />
                Tap to view
              </div>
            )}
          </button>
          <button
            type="button"
            className="overflow-hidden rounded-xl border border-border bg-muted/10 text-left transition-colors hover:bg-muted/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            onClick={onOpenVoucher}
          >
            <p className="border-b border-border/70 px-3 py-2 text-xs font-medium text-muted-foreground">
              Voucher
            </p>
            {voucherUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={voucherUrl} alt={`Voucher for ${name}`} className="aspect-[4/3] w-full object-contain bg-black/5" />
            ) : (
              <div className="flex aspect-[4/3] flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Ticket className="size-5" aria-hidden />
                Tap to view
              </div>
            )}
          </button>
        </div>
      </section>

      <section className={panelClass} aria-labelledby="irr-detail-programme">
        <h3 id="irr-detail-programme" className="text-sm font-semibold text-card-foreground">
          Programme & subjects
        </h3>
        <dl className="mt-3 grid gap-3">
          <DetailField
            label="Programme"
            value={`${candidate.programme_code} — ${candidate.programme_name}`}
          />
          <DetailField label="Subjects" value={subjects} />
        </dl>
      </section>

      {(candidate.guardian_name ||
        candidate.guardian_phone_number ||
        candidate.ghanapost_gps_address) && (
        <section className={panelClass} aria-labelledby="irr-detail-optional">
          <h3 id="irr-detail-optional" className="text-sm font-semibold text-card-foreground">
            Optional details
          </h3>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <DetailField label="Guardian name" value={candidate.guardian_name} />
            <DetailField label="Guardian phone" value={candidate.guardian_phone_number} />
            <DetailField label="GhanaPost GPS" value={candidate.ghanapost_gps_address} />
          </dl>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-card/85 sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
        <div className="mx-auto flex max-w-lg flex-col gap-2 sm:max-w-2xl sm:flex-row">
          <button type="button" className={btnSecondary} onClick={onBack}>
            Back
          </button>
          <button type="button" className={btnDanger} onClick={onDelete}>
            <Trash2 className="mr-2 size-4" aria-hidden />
            Delete
          </button>
          <button type="button" className={btnPrimary} onClick={onEdit}>
            <Pencil className="mr-2 size-4" aria-hidden />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

function ImagePreviewModal({
  kind,
  candidateName,
  url,
  loading,
  error,
  downloading,
  onDownload,
  onDismiss,
}: {
  kind: ImagePreviewKind;
  candidateName: string;
  url: string | null;
  loading: boolean;
  error: string | null;
  downloading: boolean;
  onDownload: () => void;
  onDismiss: () => void;
}) {
  const title = kind === "photograph" ? "Photograph" : "Voucher";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="irr-image-preview-title"
    >
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-foreground/50 backdrop-blur-[2px]"
        onClick={onDismiss}
      />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border/80 bg-card shadow-xl">
        <div className="flex items-center gap-2 border-b border-border/70 px-3 py-2">
          <div className="min-w-0 flex-1">
            <h2 id="irr-image-preview-title" className="truncate text-xs font-semibold text-foreground">
              {title}
              <span className="font-normal text-muted-foreground"> · {candidateName}</span>
            </h2>
          </div>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md border border-input-border bg-background text-foreground transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-50"
            aria-label={downloading ? "Downloading" : "Download"}
            title="Download"
            onClick={onDownload}
            disabled={loading || !url || downloading || Boolean(error)}
          >
            <Download className="size-3.5" aria-hidden />
          </button>
          <button
            type="button"
            className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Dismiss"
            title="Dismiss"
            onClick={onDismiss}
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-black/[0.03] p-2 dark:bg-black/20">
          {loading ? (
            <p className="py-16 text-xs text-muted-foreground">Loading…</p>
          ) : error ? (
            <p className="m-3 rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt={`${title} for ${candidateName}`}
              className="max-h-[min(78vh,34rem)] w-auto max-w-full object-contain"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function PhotoCaptureCard({
  title,
  hint,
  captureMode,
  file,
  existingPreviewUrl,
  required,
  onFileChange,
}: {
  title: string;
  hint: string;
  captureMode: "user" | "environment";
  file: File | null;
  existingPreviewUrl: string | null;
  required: boolean;
  onFileChange: (file: File | null) => void;
}) {
  const cameraId = useId();
  const galleryId = useId();
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const previewUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (previewUrlRef.current && previewUrlRef.current !== previewUrl) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = previewUrl;
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = null;
      }
    };
  }, [previewUrl]);

  const displayUrl = previewUrl ?? existingPreviewUrl;
  const hasImage = Boolean(displayUrl);

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-3">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>

      {hasImage ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-background">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={displayUrl!}
            alt={file ? file.name : "Saved image"}
            className="max-h-72 w-full object-contain bg-black/5"
          />
        </div>
      ) : (
        <div className="mt-3 flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background/60 px-4 py-6 text-center">
          <Camera className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No photo yet</p>
        </div>
      )}

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor={cameraId} className={btnFilePicker}>
          <Camera className="size-4 shrink-0" aria-hidden />
          {hasImage ? "Retake photo" : "Take photo"}
        </label>
        <input
          id={cameraId}
          type="file"
          accept="image/*"
          capture={captureMode}
          className="sr-only"
          required={required && !hasImage}
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            onFileChange(next);
            e.target.value = "";
          }}
        />
        <label htmlFor={galleryId} className={btnFilePicker}>
          <ImageIcon className="size-4 shrink-0" aria-hidden />
          Choose from gallery
        </label>
        <input
          id={galleryId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            onFileChange(next);
            e.target.value = "";
          }}
        />
      </div>
      {file ? (
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="truncate text-xs font-medium text-foreground" title={file.name}>
            Selected: {file.name}
          </p>
          <button
            type="button"
            className="shrink-0 text-xs font-medium text-destructive underline-offset-2 hover:underline"
            onClick={() => onFileChange(null)}
          >
            Remove
          </button>
        </div>
      ) : existingPreviewUrl ? (
        <p className="mt-2 text-xs text-muted-foreground">Current photo on file. Retake to replace.</p>
      ) : null}
    </div>
  );
}

function SubjectToggleList({
  title,
  hint,
  subjects,
  selected,
  exclusive = false,
  onToggle,
}: {
  title: string;
  hint?: string;
  subjects: ProgrammeSubjectRow[];
  selected: number[];
  exclusive?: boolean;
  onToggle: (subject: ProgrammeSubjectRow) => void;
}) {
  const selectedSet = new Set(selected);

  return (
    <fieldset>
      <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</legend>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-2 space-y-2">
        {subjects.map((s) => {
          const checked = selectedSet.has(s.subject_id);
          return (
            <button
              key={s.subject_id}
              type="button"
              role={exclusive ? "radio" : "checkbox"}
              aria-checked={checked}
              onClick={() => onToggle(s)}
              className={cn(
                "flex min-h-12 w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors",
                checked
                  ? "border-primary/45 bg-primary/5 ring-1 ring-primary/20"
                  : "border-border bg-background hover:bg-muted/40",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex size-5 shrink-0 items-center justify-center border",
                  exclusive ? "rounded-full" : "rounded-md",
                  checked
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-input-border bg-background",
                )}
                aria-hidden
              >
                {checked ? <Check className="size-3.5" /> : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-xs text-muted-foreground">{s.subject_code}</span>
                <span className="block text-sm font-medium text-foreground">{s.subject_name}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
