"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RegistrationCandidate, RegistrationSubjectSelection } from "@/types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/dashboard/SectionLabel";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  User,
  Keyboard,
  Copy,
  X,
  GraduationCap,
  Clock,
  BookOpen,
  Info,
  Image as ImageIcon,
  Upload,
  Loader2,
  Trash2,
  ZoomIn,
  Check,
  XCircle,
  CheckCircle2,
} from "lucide-react";
import {
  getProgrammeSubjects,
  getCurrentUser,
} from "@/lib/api";
import {
  deleteCandidateDetailPhoto,
  fetchCandidatePhoto,
  fetchCandidatePhotoFile,
  isPlatformAdmin,
  listProgrammesForCandidateEdit,
  updateCandidateDetail,
  uploadCandidateDetailPhoto,
} from "@/lib/candidate-detail-access";
import { toast } from "sonner";
import type {
  RegistrationCandidatePhoto,
  ProgrammeSubjectRequirements,
  Programme,
  User as UserType,
} from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit2, Save, X as XIcon, FileText } from "lucide-react";
import { SubjectSelectionPanel } from "@/components/school/SubjectSelectionPanel";
import { SearchableSelect } from "@/components/SearchableSelect";
import { isStructuredRegistrationType } from "@/lib/school-registration";
import { autoSelectSubjectIds } from "@/lib/subject-auto-select";
import {
  feePaymentStatusLabel,
  registrationStatusBadgeClass,
  registrationStatusLabel,
} from "@/lib/registration-status";

interface CandidateDetailModalProps {
  candidate: RegistrationCandidate | null;
  candidates: RegistrationCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCandidateChange?: (candidate: RegistrationCandidate) => void;
}

// Helper function to calculate age
function calculateAge(dateOfBirth: string): number {
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function CandidateDetailModal({
  candidate,
  candidates,
  open,
  onOpenChange,
  onCandidateChange,
}: CandidateDetailModalProps) {
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);
  const [photo, setPhoto] = useState<RegistrationCandidatePhoto | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Subject / programme editing state
  const [editingSubjects, setEditingSubjects] = useState(false);
  const [programmeSubjects, setProgrammeSubjects] = useState<ProgrammeSubjectRequirements | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [savingSubjects, setSavingSubjects] = useState(false);
  const [editProgrammeId, setEditProgrammeId] = useState<number | null>(null);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loadingProgrammes, setLoadingProgrammes] = useState(false);

  // Bio data editing state
  const [editingBio, setEditingBio] = useState(false);
  const [bioData, setBioData] = useState({
    firstname: "",
    lastname: "",
    othername: "",
    date_of_birth: "",
    gender: "",
    contact_email: "",
    contact_phone: "",
    address: "",
    national_id: "",
  });
  const [savingBio, setSavingBio] = useState(false);

  // Guardian data editing state
  const [editingGuardian, setEditingGuardian] = useState(false);
  const [guardianData, setGuardianData] = useState({
    guardian_name: "",
    guardian_phone: "",
    guardian_digital_address: "",
    guardian_national_id: "",
  });
  const [savingGuardian, setSavingGuardian] = useState(false);

  // Approval state
  const [currentUser, setCurrentUser] = useState<UserType | null>(null);

  // Load current user on mount
  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (error) {
        console.error("Failed to load current user:", error);
      }
    };
    loadUser();
  }, []);

  // Find current candidate index
  const currentIndex = candidate ? candidates.findIndex((c) => c.id === candidate.id) : -1;
  const canNavigatePrevious = currentIndex > 0;
  const canNavigateNext = currentIndex >= 0 && currentIndex < candidates.length - 1;
  const positionText =
    candidate && currentIndex >= 0 ? `${currentIndex + 1} of ${candidates.length}` : "";

  // Navigation handlers
  const handlePrevious = () => {
    if (canNavigatePrevious && onCandidateChange && currentIndex > 0) {
      onCandidateChange(candidates[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (canNavigateNext && onCandidateChange && currentIndex < candidates.length - 1) {
      onCandidateChange(candidates[currentIndex + 1]);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!open || !onCandidateChange) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" && canNavigatePrevious) {
        event.preventDefault();
        handlePrevious();
      } else if (event.key === "ArrowRight" && canNavigateNext) {
        event.preventDefault();
        handleNext();
      } else if (event.key === "Escape") {
        onOpenChange(false);
      } else if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        setShowKeyboardShortcuts(!showKeyboardShortcuts);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    open,
    currentIndex,
    candidates,
    onCandidateChange,
    canNavigatePrevious,
    canNavigateNext,
    showKeyboardShortcuts,
    onOpenChange,
  ]);

  const copyRegistrationNumber = () => {
    if (candidate?.registration_number) {
      navigator.clipboard.writeText(candidate.registration_number);
      toast.success("Registration number copied to clipboard");
    }
  };

  // Refresh candidate from candidates list when modal opens (in case data was updated)
  useEffect(() => {
    if (candidate && open && candidates.length > 0) {
      const updatedCandidate = candidates.find((c) => c.id === candidate.id);
      if (updatedCandidate && updatedCandidate !== candidate && onCandidateChange) {
        // Only update if there are meaningful changes (like index_number being populated)
        if (updatedCandidate.index_number !== candidate.index_number) {
          onCandidateChange(updatedCandidate);
        }
      }
    }
  }, [open, candidates, candidate?.id]);

  // Load photo when candidate changes or currentUser loads
  useEffect(() => {
    if (candidate && open) {
      loadPhoto();
    } else {
      setPhoto(null);
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
        setPhotoUrl(null);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.id, open, currentUser?.role]);

  // Initialize subject selections and bio data when candidate changes
  useEffect(() => {
    if (candidate) {
      const currentSubjectIds = (candidate.subject_selections || [])
        .map((s) => s.subject_id)
        .filter((id): id is number => id !== null && id !== undefined);
      setSelectedSubjectIds(currentSubjectIds);
      setEditProgrammeId(candidate.programme_id);
      setProgrammeSubjects(null);
      setProgrammes([]);

      // Exit edit mode when candidate changes
      setEditingSubjects(false);
      setEditingBio(false);
      setEditingGuardian(false);

      // Initialize bio data
      setBioData({
        firstname: candidate.firstname || "",
        lastname: candidate.lastname || "",
        othername: candidate.othername || "",
        date_of_birth: candidate.date_of_birth ? new Date(candidate.date_of_birth).toISOString().split('T')[0] : "",
        gender: candidate.gender || "",
        contact_email: candidate.contact_email || "",
        contact_phone: candidate.contact_phone || "",
        address: candidate.address || "",
        national_id: candidate.national_id || "",
      });

      // Initialize guardian data
      setGuardianData({
        guardian_name: candidate.guardian_name || "",
        guardian_phone: candidate.guardian_phone || "",
        guardian_digital_address: candidate.guardian_digital_address || "",
        guardian_national_id: candidate.guardian_national_id || "",
      });
    }
  }, [candidate?.id]);

  // Load programmes + subjects when entering programme/subject edit mode
  useEffect(() => {
    if (!editingSubjects || !candidate) return;

    let cancelled = false;
    async function loadEditContext() {
      setLoadingProgrammes(true);
      try {
        const examId = candidate!.registration_exam_id;
        const admin = isPlatformAdmin(currentUser?.role);
        const progs = await listProgrammesForCandidateEdit({
          examId,
          schoolId: candidate!.school_id,
          isAdmin: admin,
        });
        if (cancelled) return;
        setProgrammes(progs);

        const programmeId = editProgrammeId ?? candidate!.programme_id;
        if (programmeId) {
          setLoadingSubjects(true);
          try {
            const subjects = await getProgrammeSubjects(programmeId);
            if (cancelled) return;
            setProgrammeSubjects(subjects);
          } catch (error) {
            console.error(error);
            toast.error("Failed to load programme subjects");
            if (!cancelled) setProgrammeSubjects(null);
          } finally {
            if (!cancelled) setLoadingSubjects(false);
          }
        } else {
          setProgrammeSubjects(null);
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load programmes");
        if (!cancelled) {
          setProgrammes([]);
          setEditingSubjects(false);
        }
      } finally {
        if (!cancelled) setLoadingProgrammes(false);
      }
    }

    void loadEditContext();
    return () => {
      cancelled = true;
    };
    // Only re-run when opening edit mode, switching candidate, or role resolves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingSubjects, candidate?.id, currentUser?.role]);

  const loadPhoto = async () => {
    if (!candidate) return;
    setLoadingPhoto(true);
    try {
      const admin = isPlatformAdmin(currentUser?.role);
      const photoData = await fetchCandidatePhoto(candidate.id, admin);
      setPhoto(photoData);
      if (photoData) {
        const url = await fetchCandidatePhotoFile(candidate.id, admin);
        setPhotoUrl(url);
      } else {
        setPhotoUrl(null);
      }
    } catch (error) {
      console.error("Failed to load photo:", error);
      setPhoto(null);
      setPhotoUrl(null);
    } finally {
      setLoadingPhoto(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith("image/")) {
        toast.error("Please select an image file");
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleUploadPhoto = async () => {
    if (!candidate || !selectedFile) return;

    setUploadingPhoto(true);
    try {
      await uploadCandidateDetailPhoto(
        candidate.id,
        selectedFile,
        isPlatformAdmin(currentUser?.role),
        false
      );
      toast.success("Photo uploaded successfully");
      setUploadDialogOpen(false);
      setSelectedFile(null);
      await loadPhoto();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to upload photo");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleDeletePhoto = async () => {
    if (!candidate || !photo) return;

    if (!confirm("Are you sure you want to delete this photo?")) {
      return;
    }

    try {
      await deleteCandidateDetailPhoto(
        candidate.id,
        isPlatformAdmin(currentUser?.role)
      );
      toast.success("Photo deleted successfully");
      setPhoto(null);
      if (photoUrl) {
        URL.revokeObjectURL(photoUrl);
        setPhotoUrl(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete photo");
    }
  };

  const handleProgrammeChange = async (value: string) => {
    const programmeId = value ? parseInt(value, 10) : null;
    setEditProgrammeId(programmeId);
    setProgrammeSubjects(null);
    setSelectedSubjectIds([]);
    if (!programmeId || !candidate) return;

    setLoadingSubjects(true);
    try {
      const subjects = await getProgrammeSubjects(programmeId);
      setProgrammeSubjects(subjects);
      setSelectedSubjectIds(
        autoSelectSubjectIds(
          subjects,
          candidate.registration_type,
          candidate.exam?.exam_series,
          candidate.exam?.allows_free_tvet
        )
      );
    } catch (error) {
      console.error(error);
      toast.error("Failed to load programme subjects");
      setProgrammeSubjects(null);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleSaveSubjects = async () => {
    if (!candidate) return;

    if (!editProgrammeId) {
      toast.error("Programme selection is required");
      return;
    }

    const regType = candidate.registration_type;
    if (!isStructuredRegistrationType(regType) && selectedSubjectIds.length === 0) {
      toast.error("At least one subject must be selected");
      return;
    }

    setSavingSubjects(true);
    try {
      const updatedCandidate = await updateCandidateDetail(
        candidate.id,
        {
          programme_id: editProgrammeId,
          subject_ids: selectedSubjectIds,
        },
        isPlatformAdmin(currentUser?.role)
      );

      toast.success("Programme and subjects updated successfully");
      setEditingSubjects(false);
      setProgrammeSubjects(null);

      if (onCandidateChange) {
        onCandidateChange(updatedCandidate);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update subject selections");
      console.error(error);
    } finally {
      setSavingSubjects(false);
    }
  };

  const handleCancelEdit = () => {
    if (candidate) {
      const currentSubjectIds = (candidate.subject_selections || [])
        .map((s) => s.subject_id)
        .filter((id): id is number => id !== null && id !== undefined);
      setSelectedSubjectIds(currentSubjectIds);
      setEditProgrammeId(candidate.programme_id);
    }
    setEditingSubjects(false);
    setProgrammeSubjects(null);
  };

  const startEditingSubjects = () => {
    if (!candidate) return;
    setEditProgrammeId(candidate.programme_id);
    setEditingSubjects(true);
  };

  const handleSaveBio = async () => {
    if (!candidate) return;

    if (!bioData.firstname.trim() || !bioData.lastname.trim()) {
      toast.error("First name and last name are required");
      return;
    }
    if (!bioData.date_of_birth) {
      toast.error("Date of birth is required");
      return;
    }
    if (!bioData.gender.trim()) {
      toast.error("Gender is required");
      return;
    }

    setSavingBio(true);
    try {
      const updatedCandidate = await updateCandidateDetail(
        candidate.id,
        {
          firstname: bioData.firstname,
          lastname: bioData.lastname,
          othername: bioData.othername || null,
          date_of_birth: bioData.date_of_birth,
          gender: bioData.gender,
          contact_email: bioData.contact_email || null,
          contact_phone: bioData.contact_phone || null,
          address: bioData.address || null,
          national_id: bioData.national_id || null,
        },
        isPlatformAdmin(currentUser?.role)
      );

      toast.success("Bio data updated successfully");
      setEditingBio(false);

      // Update the candidate in parent component
      if (onCandidateChange) {
        onCandidateChange(updatedCandidate);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update bio data");
      console.error(error);
    } finally {
      setSavingBio(false);
    }
  };

  const handleCancelBioEdit = () => {
    // Reset to original bio data
    if (candidate) {
      setBioData({
        firstname: candidate.firstname || "",
        lastname: candidate.lastname || "",
        othername: candidate.othername || "",
        date_of_birth: candidate.date_of_birth ? new Date(candidate.date_of_birth).toISOString().split('T')[0] : "",
        gender: candidate.gender || "",
        contact_email: candidate.contact_email || "",
        contact_phone: candidate.contact_phone || "",
        address: candidate.address || "",
        national_id: candidate.national_id || "",
      });
    }
    setEditingBio(false);
  };

  const handleSaveGuardian = async () => {
    if (!candidate) return;

    setSavingGuardian(true);
    try {
      const updatedCandidate = await updateCandidateDetail(
        candidate.id,
        {
          guardian_name: guardianData.guardian_name || null,
          guardian_phone: guardianData.guardian_phone || null,
          guardian_digital_address: guardianData.guardian_digital_address || null,
          guardian_national_id: guardianData.guardian_national_id || null,
        },
        isPlatformAdmin(currentUser?.role)
      );

      toast.success("Guardian information updated successfully");
      setEditingGuardian(false);

      // Update the candidate in parent component
      if (onCandidateChange) {
        onCandidateChange(updatedCandidate);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update guardian information");
      console.error(error);
    } finally {
      setSavingGuardian(false);
    }
  };

  const handleCancelGuardianEdit = () => {
    // Reset to original guardian data
    if (candidate) {
      setGuardianData({
        guardian_name: candidate.guardian_name || "",
        guardian_phone: candidate.guardian_phone || "",
        guardian_digital_address: candidate.guardian_digital_address || "",
        guardian_national_id: candidate.guardian_national_id || "",
      });
    }
    setEditingGuardian(false);
  };

  if (!candidate) return null;

  const subjectSelections = candidate.subject_selections || [];
  const orderedSubjects = [...subjectSelections].sort((a, b) => {
    const aElective = a.subject_type === "ELECTIVE" ? 1 : 0;
    const bElective = b.subject_type === "ELECTIVE" ? 1 : 0;
    if (aElective !== bElective) return aElective - bElective;
    const codeCmp = a.subject_code.localeCompare(b.subject_code, undefined, {
      sensitivity: "base",
    });
    if (codeCmp !== 0) return codeCmp;
    return (a.subject_id ?? a.id) - (b.subject_id ?? b.id);
  });
  const subjectSplitMid = Math.ceil(orderedSubjects.length / 2);
  const subjectColumnOne = orderedSubjects.slice(0, subjectSplitMid);
  const subjectColumnTwo = orderedSubjects.slice(subjectSplitMid);

  const hasPhoto = !!photo;
  const feeStatus = candidate.fee_payment_status || "unpaid";
  const isFreeTvet = candidate.registration_type === "free_tvet";
  const feeUnpaid =
    !isFreeTvet && feeStatus !== "not_required" && feeStatus === "unpaid";

  // Check if exam is closed
  const isExamClosed = candidate.exam?.registration_period
    ? (() => {
        const isActive = candidate.exam.registration_period.is_active;
        const now = new Date();
        const endDate = new Date(candidate.exam.registration_period.registration_end_date);
        return !isActive || now > endDate;
      })()
    : false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] w-full max-w-4xl flex-col gap-0 overflow-hidden border-border p-0 shadow-none">
        <DialogHeader className="shrink-0 border-b border-border bg-card px-4 pb-2.5 pr-12 pt-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {photo && photoUrl ? (
                <div className="relative h-12 w-10 flex-shrink-0 overflow-hidden rounded-md border border-border">
                  <img
                    src={photoUrl}
                    alt={candidate.name}
                    className="h-full w-full cursor-pointer object-cover transition-opacity hover:opacity-80"
                    onClick={() => {
                      if (photoUrl) {
                        window.open(photoUrl, '_blank');
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex h-12 w-10 flex-shrink-0 items-center justify-center rounded-md border border-border bg-muted">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-lg font-medium tracking-[-0.02em]">
                  {candidate.name}
                </DialogTitle>
                <DialogDescription className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    Registration: <span className="font-mono">{candidate.registration_number}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5"
                      onClick={copyRegistrationNumber}
                      title="Copy registration number"
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </span>
                  {candidate.programme_code && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-xs font-medium">
                      <GraduationCap className="h-3 w-3" />
                      {candidate.programme_code}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${registrationStatusBadgeClass(
                      candidate.registration_status
                    )}`}
                  >
                    {registrationStatusLabel(candidate.registration_status)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Fee: {feePaymentStatusLabel(feeStatus)}
                  </span>
                </DialogDescription>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
                title="Keyboard shortcuts"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-2.5 text-xs">
            <span
              className={
                hasPhoto
                  ? "inline-flex items-center gap-1 text-success"
                  : "inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"
              }
            >
              {hasPhoto ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {hasPhoto ? "Photo uploaded" : "Photo missing"}
            </span>
            <span
              className={
                !feeUnpaid
                  ? "inline-flex items-center gap-1 text-success"
                  : "inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"
              }
            >
              {!feeUnpaid ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5" />
              )}
              {feePaymentStatusLabel(feeStatus)}
            </span>
          </div>
        </DialogHeader>

        {/* Keyboard Shortcuts Info */}
        {showKeyboardShortcuts && (
          <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-2">
            <div className="flex items-start gap-2 text-sm">
              <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 text-xs font-semibold">Keyboard shortcuts</div>
                <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <div>← → Navigate candidates</div>
                  <div>Esc Close modal</div>
                  <div>Ctrl+K Toggle shortcuts</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setShowKeyboardShortcuts(false)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pb-3">
          <div className="space-y-3 py-2.5">
            {/* Photo and Candidate Information - Side by Side */}
            <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch">
              <section className="min-w-0 flex-1">
                <SectionLabel
                  className="mb-2"
                  action={
                    !editingBio && !isExamClosed ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => setEditingBio(true)}
                      >
                        <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                        Edit bio
                      </Button>
                    ) : undefined
                  }
                >
                  Candidate information
                </SectionLabel>
                <div className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-none">
                  {editingBio ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-firstname">First Name *</Label>
                          <Input
                            id="edit-firstname"
                            value={bioData.firstname}
                            onChange={(e) => setBioData({ ...bioData, firstname: e.target.value })}
                            disabled={savingBio}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-lastname">Last Name *</Label>
                          <Input
                            id="edit-lastname"
                            value={bioData.lastname}
                            onChange={(e) => setBioData({ ...bioData, lastname: e.target.value })}
                            disabled={savingBio}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-othername">Other Name (Optional)</Label>
                        <Input
                          id="edit-othername"
                          value={bioData.othername}
                          onChange={(e) => setBioData({ ...bioData, othername: e.target.value })}
                          disabled={savingBio}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-dob">Date of Birth *</Label>
                          <Input
                            id="edit-dob"
                            type="date"
                            value={bioData.date_of_birth}
                            onChange={(e) => setBioData({ ...bioData, date_of_birth: e.target.value })}
                            disabled={savingBio}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-gender">Gender *</Label>
                          <Select
                            value={bioData.gender}
                            onValueChange={(value) => setBioData({ ...bioData, gender: value })}
                            disabled={savingBio}
                          >
                            <SelectTrigger id="edit-gender">
                              <SelectValue placeholder="Select gender" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Male">Male</SelectItem>
                              <SelectItem value="Female">Female</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-email">Contact Email</Label>
                          <Input
                            id="edit-email"
                            type="email"
                            value={bioData.contact_email}
                            onChange={(e) => setBioData({ ...bioData, contact_email: e.target.value })}
                            disabled={savingBio}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="edit-phone">Contact Phone</Label>
                          <Input
                            id="edit-phone"
                            value={bioData.contact_phone}
                            onChange={(e) => setBioData({ ...bioData, contact_phone: e.target.value })}
                            disabled={savingBio}
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-address">Address</Label>
                        <Input
                          id="edit-address"
                          value={bioData.address}
                          onChange={(e) => setBioData({ ...bioData, address: e.target.value })}
                          disabled={savingBio}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-national-id">National ID</Label>
                        <Input
                          id="edit-national-id"
                          value={bioData.national_id}
                          onChange={(e) => setBioData({ ...bioData, national_id: e.target.value })}
                          disabled={savingBio}
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          onClick={handleSaveBio}
                          disabled={
                            savingBio ||
                            !bioData.firstname.trim() ||
                            !bioData.lastname.trim() ||
                            !bioData.date_of_birth ||
                            !bioData.gender.trim()
                          }
                          size="sm"
                        >
                          {savingBio ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            <>
                              <Save className="mr-2 h-4 w-4" />
                              Save Changes
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={handleCancelBioEdit}
                          disabled={savingBio}
                          size="sm"
                        >
                          <XIcon className="mr-2 h-4 w-4" />
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                      <div className="space-y-0.5 md:col-span-2">
                        <div className="text-xs text-muted-foreground">Full Name</div>
                        <div className="text-sm font-medium">{candidate.name}</div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          Date of Birth
                        </div>
                        <div className="text-sm font-medium">
                          {candidate.date_of_birth ? (
                            <>
                              {new Date(candidate.date_of_birth).toLocaleDateString()}
                              <span className="ml-2 text-muted-foreground">
                                (Age: {calculateAge(candidate.date_of_birth)})
                              </span>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          Gender
                        </div>
                        <div className="text-sm font-medium">
                          {candidate.gender || (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </div>
                      {candidate.programme_code && (
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <GraduationCap className="h-3 w-3" />
                            Programme Code
                          </div>
                          <div className="text-sm font-medium">{candidate.programme_code}</div>
                        </div>
                      )}
                      {candidate.contact_email && (
                        <div className="space-y-0.5">
                          <div className="text-xs text-muted-foreground">Contact Email</div>
                          <div className="truncate text-sm font-medium">{candidate.contact_email}</div>
                        </div>
                      )}
                      {candidate.contact_phone && (
                        <div className="space-y-0.5">
                          <div className="text-xs text-muted-foreground">Contact Phone</div>
                          <div className="text-sm font-medium">{candidate.contact_phone}</div>
                        </div>
                      )}
                      {candidate.address && (
                        <div className="space-y-0.5 md:col-span-2">
                          <div className="text-xs text-muted-foreground">Address</div>
                          <div className="text-sm font-medium">{candidate.address}</div>
                        </div>
                      )}
                      {candidate.national_id && (
                        <div className="space-y-0.5">
                          <div className="text-xs text-muted-foreground">National ID</div>
                          <div className="text-sm font-medium">{candidate.national_id}</div>
                        </div>
                      )}
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          Registration Date
                        </div>
                        <div className="text-sm font-medium">
                          {new Date(candidate.registration_date).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">Index Number</div>
                        <div className="font-mono text-sm font-medium">
                          {candidate.index_number || (
                            <span className="italic text-muted-foreground">Not available</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="w-full shrink-0 lg:w-40">
                <SectionLabel className="mb-2">Photo</SectionLabel>
                <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-border bg-card p-3 shadow-none">
                  {loadingPhoto ? (
                    <Skeleton className="h-[9.5rem] w-[7.75rem] rounded-md" />
                  ) : photo && photoUrl ? (
                    <>
                      <div
                        className="group relative mx-auto h-[9.5rem] w-[7.75rem] cursor-pointer overflow-hidden rounded-md border border-primary bg-muted transition-shadow hover:shadow-md"
                        onClick={() => {
                          if (photoUrl) window.open(photoUrl, "_blank");
                        }}
                      >
                        <img
                          src={photoUrl}
                          alt={candidate.name}
                          className="pointer-events-none h-full w-full object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/10">
                          <ZoomIn className="h-6 w-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                        </div>
                        <div className="absolute right-1.5 top-1.5">
                          <Badge className="bg-primary px-1.5 py-0 text-[10px]">Active</Badge>
                        </div>
                      </div>
                      {!isExamClosed && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-full"
                          onClick={() => setUploadDialogOpen(true)}
                        >
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Change Photo
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="mx-auto flex flex-col items-center justify-center text-muted-foreground">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                          <User className="h-8 w-8" />
                        </div>
                        <p className="mt-1.5 text-center text-xs">No photo available</p>
                      </div>
                      {!isExamClosed && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 w-full"
                          onClick={() => setUploadDialogOpen(true)}
                        >
                          <Upload className="mr-1.5 h-3.5 w-3.5" />
                          Upload Photo
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </section>
            </div>

            <section>
              <SectionLabel
                className="mb-2"
                action={
                  !editingGuardian && !isExamClosed ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={() => setEditingGuardian(true)}
                    >
                      <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                      {candidate.guardian_name || candidate.guardian_phone
                        ? "Edit guardian"
                        : "Add guardian"}
                    </Button>
                  ) : undefined
                }
              >
                Guardian information
              </SectionLabel>
              <div className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-none">
                {editingGuardian ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-guardian-name">Guardian Name</Label>
                      <Input
                        id="edit-guardian-name"
                        value={guardianData.guardian_name}
                        onChange={(e) =>
                          setGuardianData({ ...guardianData, guardian_name: e.target.value })
                        }
                        disabled={savingGuardian}
                        placeholder="Enter guardian full name"
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-guardian-phone">Guardian Phone</Label>
                        <Input
                          id="edit-guardian-phone"
                          value={guardianData.guardian_phone}
                          onChange={(e) =>
                            setGuardianData({ ...guardianData, guardian_phone: e.target.value })
                          }
                          disabled={savingGuardian}
                          placeholder="+1234567890"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="edit-guardian-digital-address">Digital Address</Label>
                        <Input
                          id="edit-guardian-digital-address"
                          value={guardianData.guardian_digital_address}
                          onChange={(e) =>
                            setGuardianData({
                              ...guardianData,
                              guardian_digital_address: e.target.value,
                            })
                          }
                          disabled={savingGuardian}
                          placeholder="GA-123-4567"
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-guardian-national-id">Guardian National ID</Label>
                      <Input
                        id="edit-guardian-national-id"
                        value={guardianData.guardian_national_id}
                        onChange={(e) =>
                          setGuardianData({
                            ...guardianData,
                            guardian_national_id: e.target.value,
                          })
                        }
                        disabled={savingGuardian}
                        placeholder="GHA-123456789-1"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Button onClick={handleSaveGuardian} disabled={savingGuardian} size="sm">
                        {savingGuardian ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-2 h-4 w-4" />
                            Save Changes
                          </>
                        )}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleCancelGuardianEdit}
                        disabled={savingGuardian}
                        size="sm"
                      >
                        <XIcon className="mr-2 h-4 w-4" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
                    {candidate.guardian_name ? (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">Guardian Name</div>
                        <div className="text-sm font-medium">{candidate.guardian_name}</div>
                      </div>
                    ) : (
                      <div className="space-y-0.5 md:col-span-2">
                        <div className="text-xs italic text-muted-foreground">
                          No guardian information available
                        </div>
                      </div>
                    )}
                    {candidate.guardian_phone && (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">Guardian Phone</div>
                        <div className="text-sm font-medium">{candidate.guardian_phone}</div>
                      </div>
                    )}
                    {candidate.guardian_digital_address && (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">Digital Address</div>
                        <div className="text-sm font-medium">
                          {candidate.guardian_digital_address}
                        </div>
                      </div>
                    )}
                    {candidate.guardian_national_id && (
                      <div className="space-y-0.5">
                        <div className="text-xs text-muted-foreground">Guardian National ID</div>
                        <div className="text-sm font-medium">
                          {candidate.guardian_national_id}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>

            <section>
              <SectionLabel
                className="mb-2"
                action={
                  !editingSubjects && !isExamClosed ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7"
                      onClick={startEditingSubjects}
                    >
                      <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                      {candidate?.programme_id ? "Edit subjects" : "Add programme & subjects"}
                    </Button>
                  ) : undefined
                }
              >
                Registered subjects
              </SectionLabel>

              {!editingSubjects ? (
                subjectSelections.length === 0 ? (
                  <div className="rounded-lg border border-border bg-card p-3 shadow-none">
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      <BookOpen className="mx-auto mb-2 h-8 w-8 opacity-50" />
                      <p>
                        {candidate?.programme_id
                          ? "No subjects registered for this candidate."
                          : "No programme or subjects have been selected for this candidate."}
                      </p>
                      {!isExamClosed && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 h-7"
                          onClick={startEditingSubjects}
                        >
                          <Edit2 className="mr-1.5 h-3.5 w-3.5" />
                          {candidate?.programme_id
                            ? "Add subjects"
                            : "Add programme & subjects"}
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2 rounded-lg border border-border bg-card p-3 shadow-none">
                    {candidate.exam && (
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-medium">
                          {candidate.exam.exam_type}
                          {candidate.exam.exam_series
                            ? ` ${candidate.exam.exam_series}`
                            : ""}{" "}
                          {candidate.exam.year}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {subjectSelections.length}{" "}
                          {subjectSelections.length === 1 ? "subject" : "subjects"}
                        </p>
                      </div>
                    )}
                    <div
                      className={
                        subjectColumnTwo.length > 0
                          ? "grid grid-cols-1 gap-3 sm:grid-cols-2"
                          : "grid grid-cols-1"
                      }
                    >
                      {[subjectColumnOne, subjectColumnTwo]
                        .filter((column) => column.length > 0)
                        .map((column, columnIndex) => (
                          <div key={columnIndex} className="min-w-0 space-y-1.5">
                            {column.map((subject) => {
                              const isElective = subject.subject_type === "ELECTIVE";
                              return (
                                <div
                                  key={subject.id}
                                  className={
                                    isElective
                                      ? "flex min-w-0 items-center rounded-md border border-sky-500/20 border-l-2 border-l-sky-500/50 bg-sky-500/5 px-2.5 py-1.5"
                                      : "flex min-w-0 items-center rounded-md border border-primary/20 border-l-2 border-l-primary/60 bg-primary/5 px-2.5 py-1.5"
                                  }
                                >
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className={
                                        isElective
                                          ? "truncate text-sm font-normal"
                                          : "truncate text-sm font-medium"
                                      }
                                    >
                                      {subject.subject_name}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {subject.subject_code}
                                      {subject.series && ` · Series ${subject.series}`}
                                      {isElective ? " · Elective" : " · Core"}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                    </div>
                  </div>
                )
              ) : (
                <div className="space-y-3 rounded-lg border border-border bg-card p-3 shadow-none">
                  <div>
                    <p className="text-sm font-medium">Edit programme & subjects</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Choose a programme for {candidate?.name}, then select subjects.
                      Changes are validated against programme requirements.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Programme *</Label>
                    <SearchableSelect
                      options={programmes.map((p) => ({
                        value: String(p.id),
                        label: `${p.code} — ${p.name}`,
                      }))}
                      value={editProgrammeId != null ? String(editProgrammeId) : undefined}
                      onValueChange={(value) => {
                        void handleProgrammeChange(value ?? "");
                      }}
                      placeholder={
                        loadingProgrammes ? "Loading programmes…" : "Search programmes…"
                      }
                      searchPlaceholder="Search programmes…"
                      disabled={loadingProgrammes || savingSubjects}
                    />
                    {!loadingProgrammes && programmes.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No programmes are enabled for this examination yet.
                      </p>
                    )}
                  </div>

                  {editProgrammeId ? (
                    <SubjectSelectionPanel
                      programmeSubjects={programmeSubjects}
                      loading={loadingSubjects || loadingProgrammes}
                      selectedSubjectIds={selectedSubjectIds}
                      onChange={setSelectedSubjectIds}
                      registrationType={candidate?.registration_type ?? null}
                      examSeries={candidate?.exam?.exam_series}
                      allowsFreeTvet={candidate?.exam?.allows_free_tvet}
                    />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Select a programme to load available subjects.
                    </p>
                  )}

                  <div className="flex justify-end gap-2 border-t border-border pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCancelEdit}
                      disabled={savingSubjects}
                    >
                      <XIcon className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleSaveSubjects}
                      disabled={
                        savingSubjects ||
                        loadingSubjects ||
                        loadingProgrammes ||
                        !editProgrammeId
                      }
                    >
                      {savingSubjects ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Enhanced Footer with Navigation */}
        {candidates.length > 1 && (
          <DialogFooter className="shrink-0 justify-between border-t bg-muted/30 px-4 pb-3 pt-2.5 sm:justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Keyboard className="h-3 w-3" />
              Use ← → to navigate
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevious}
                disabled={!canNavigatePrevious}
                className="h-8 w-8"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[80px] text-center text-sm font-medium text-muted-foreground">
                {positionText}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                disabled={!canNavigateNext}
                className="h-8 w-8"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </DialogFooter>
        )}

        {/* Photo Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="border-border shadow-none sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-medium tracking-[-0.02em]">
                Upload photo
              </DialogTitle>
              <DialogDescription>
                Passport photo for {candidate.name}. File will be renamed to{" "}
                <span className="font-mono">{candidate.registration_number}</span>.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="photo-upload">Select photo</Label>
                <Input
                  id="photo-upload"
                  type="file"
                  accept="image/jpeg,image/jpg"
                  onChange={handleFileSelect}
                  disabled={uploadingPhoto}
                />
                <p className="text-xs text-muted-foreground">
                  JPEG only · 155×191 px · max 2MB
                </p>
              </div>
              {selectedFile && (
                <div className="rounded-lg border border-border bg-card p-3 shadow-none">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {(selectedFile.size / 1024).toFixed(2)} KB
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedFile(null)}
                      disabled={uploadingPhoto}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                className="shadow-none"
                onClick={() => {
                  setUploadDialogOpen(false);
                  setSelectedFile(null);
                }}
                disabled={uploadingPhoto}
              >
                Cancel
              </Button>
              <Button
                className="shadow-none"
                onClick={handleUploadPhoto}
                disabled={!selectedFile || uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload photo
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
