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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { uploadCandidatePhoto, getCandidatePhoto, getAdminCandidatePhoto, getAdminPhotoFile, deleteCandidatePhoto, getPhotoFile, updateCandidate, getProgrammeSubjects, approveCandidate, getCurrentUser } from "@/lib/api";
import { toast } from "sonner";
import type { RegistrationCandidatePhoto, ProgrammeSubjectRequirements, User as UserType } from "@/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Edit2, Save, X as XIcon, FileText } from "lucide-react";

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

// Helper function to get registration status badge style
function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "APPROVED":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300";
    case "REJECTED":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300";
    case "PENDING":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300";
    default:
      return "bg-muted text-muted-foreground";
  }
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

  // Subject editing state
  const [editingSubjects, setEditingSubjects] = useState(false);
  const [programmeSubjects, setProgrammeSubjects] = useState<ProgrammeSubjectRequirements | null>(null);
  const [loadingSubjects, setLoadingSubjects] = useState(false);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [savingSubjects, setSavingSubjects] = useState(false);

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
  const [approving, setApproving] = useState(false);

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

  // Load programme subjects when entering edit mode
  useEffect(() => {
    if (editingSubjects && candidate?.programme_id && !programmeSubjects && !loadingSubjects) {
      loadProgrammeSubjects();
    }
  }, [editingSubjects, candidate?.programme_id]);

  const loadPhoto = async () => {
    if (!candidate) return;
    setLoadingPhoto(true);
    try {
      // Use admin endpoint if user is admin, otherwise use school endpoint
      const isAdmin = currentUser && (currentUser.role === "SystemAdmin" ||
        currentUser.role === "Director" ||
        currentUser.role === "DeputyDirector" ||
        currentUser.role === "PrincipalManager" ||
        currentUser.role === "SeniorManager" ||
        currentUser.role === "Manager" ||
        currentUser.role === "Staff");

      const photoData = isAdmin
        ? await getAdminCandidatePhoto(candidate.id)
        : await getCandidatePhoto(candidate.id);
      setPhoto(photoData);
      if (photoData) {
        const url = isAdmin
          ? await getAdminPhotoFile(candidate.id)
          : await getPhotoFile(candidate.id);
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
      await uploadCandidatePhoto(candidate.id, selectedFile, false);
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
      await deleteCandidatePhoto(candidate.id);
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

  const loadProgrammeSubjects = async () => {
    if (!candidate?.programme_id) return;
    setLoadingSubjects(true);
    try {
      const subjects = await getProgrammeSubjects(candidate.programme_id);
      setProgrammeSubjects(subjects);
    } catch (error) {
      toast.error("Failed to load programme subjects");
      console.error(error);
      setEditingSubjects(false);
    } finally {
      setLoadingSubjects(false);
    }
  };

  const handleSubjectToggle = (subjectId: number, isChecked: boolean) => {
    if (isChecked) {
      setSelectedSubjectIds([...selectedSubjectIds, subjectId]);
    } else {
      setSelectedSubjectIds(selectedSubjectIds.filter((id) => id !== subjectId));
    }
  };

  const handleOptionalGroupChange = (groupSubjects: { subject_id: number }[], selectedId: number) => {
    // Remove all subjects from this group, then add the selected one
    const groupIds = groupSubjects.map((s) => s.subject_id);
    const filtered = selectedSubjectIds.filter((id) => !groupIds.includes(id));
    setSelectedSubjectIds([...filtered, selectedId]);
  };

  const handleSaveSubjects = async () => {
    if (!candidate) return;

    setSavingSubjects(true);
    try {
      const updatedCandidate = await updateCandidate(candidate.id, {
        subject_ids: selectedSubjectIds,
      });

      toast.success("Subject selections updated successfully");
      setEditingSubjects(false);

      // Update the candidate in parent component
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
    // Reset to original selections
    if (candidate) {
      const currentSubjectIds = (candidate.subject_selections || [])
        .map((s) => s.subject_id)
        .filter((id): id is number => id !== null && id !== undefined);
      setSelectedSubjectIds(currentSubjectIds);
    }
    setEditingSubjects(false);
    setProgrammeSubjects(null);
  };

  const handleSaveBio = async () => {
    if (!candidate) return;

    setSavingBio(true);
    try {
      const updatedCandidate = await updateCandidate(candidate.id, {
        firstname: bioData.firstname,
        lastname: bioData.lastname,
        othername: bioData.othername || null,
        date_of_birth: bioData.date_of_birth || null,
        gender: bioData.gender || null,
        contact_email: bioData.contact_email || null,
        contact_phone: bioData.contact_phone || null,
        address: bioData.address || null,
        national_id: bioData.national_id || null,
      });

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
      const updatedCandidate = await updateCandidate(candidate.id, {
        guardian_name: guardianData.guardian_name || null,
        guardian_phone: guardianData.guardian_phone || null,
        guardian_digital_address: guardianData.guardian_digital_address || null,
        guardian_national_id: guardianData.guardian_national_id || null,
      });

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

  const handleApprove = async () => {
    if (!candidate) return;

    setApproving(true);
    try {
      const updatedCandidate = await approveCandidate(candidate.id);
      toast.success("Registration approved successfully");

      // Update the candidate in parent component
      if (onCandidateChange) {
        onCandidateChange(updatedCandidate);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to approve registration");
      console.error(error);
    } finally {
      setApproving(false);
    }
  };

  if (!candidate) return null;

  const subjectSelections = candidate.subject_selections || [];

  // Compute validation status for approval
  const isSchoolAdmin = currentUser?.role === "SchoolAdmin";
  const canApprove = candidate.registration_status === "PENDING" || candidate.registration_status === "DRAFT";
  const hasPhoto = !!photo;

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
      <DialogContent className="max-w-6xl w-[95vw] max-h-[95vh] flex flex-col p-0 overflow-hidden">
        {/* Enhanced Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b bg-gradient-to-r from-background to-muted/20 sticky top-0 z-10 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              {photo && photoUrl ? (
                <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-primary flex-shrink-0">
                  <img
                    src={photoUrl}
                    alt={candidate.name}
                    className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => {
                      if (photoUrl) {
                        window.open(photoUrl, '_blank');
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-2xl font-bold truncate">{candidate.name}</DialogTitle>
                <DialogDescription className="mt-1 flex items-center gap-3 flex-wrap">
                  <span className="flex items-center gap-2">
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
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium">
                      <GraduationCap className="h-3 w-3" />
                      {candidate.programme_code}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                      candidate.registration_status
                    )}`}
                  >
                    {candidate.registration_status}
                  </span>
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isSchoolAdmin && canApprove && (
                <Button
                  onClick={handleApprove}
                  disabled={approving || !hasPhoto}
                  className="bg-green-600 hover:bg-green-700 text-white"
                  title={!hasPhoto ? "Photo is required for approval" : "Approve registration (validation will be performed by the system)"}
                >
                  {approving ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve
                    </>
                  )}
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowKeyboardShortcuts(!showKeyboardShortcuts)}
                title="Keyboard shortcuts"
              >
                <Keyboard className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Keyboard Shortcuts Info */}
        {showKeyboardShortcuts && (
          <div className="px-6 py-3 bg-muted/50 border-b">
            <div className="flex items-start gap-2 text-sm">
              <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-medium mb-1">Keyboard Shortcuts</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
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

        <div className="flex-1 overflow-y-auto px-6 pb-4">
          <div className="space-y-6 py-4">
            {/* Photo and Candidate Information - Side by Side */}
            <div className="flex gap-6 items-stretch">
              {/* Enhanced Candidate Information Card */}
              <Card className="flex-1 flex flex-col">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Candidate Information
                  </CardTitle>
                  {!editingBio && !isExamClosed && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingBio(true)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      Edit Bio Data
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editingBio ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-firstname">First Name *</Label>
                        <Input
                          id="edit-firstname"
                          value={bioData.firstname}
                          onChange={(e) => setBioData({ ...bioData, firstname: e.target.value })}
                          disabled={savingBio}
                          required
                        />
                      </div>
                      <div className="space-y-2">
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
                    <div className="space-y-2">
                      <Label htmlFor="edit-othername">Other Name (Optional)</Label>
                      <Input
                        id="edit-othername"
                        value={bioData.othername}
                        onChange={(e) => setBioData({ ...bioData, othername: e.target.value })}
                        disabled={savingBio}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-dob">Date of Birth</Label>
                        <Input
                          id="edit-dob"
                          type="date"
                          value={bioData.date_of_birth}
                          onChange={(e) => setBioData({ ...bioData, date_of_birth: e.target.value })}
                          disabled={savingBio}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-gender">Gender</Label>
                        <Select
                          value={bioData.gender}
                          onValueChange={(value) => setBioData({ ...bioData, gender: value })}
                          disabled={savingBio}
                        >
                          <SelectTrigger>
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
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-email">Contact Email</Label>
                        <Input
                          id="edit-email"
                          type="email"
                          value={bioData.contact_email}
                          onChange={(e) => setBioData({ ...bioData, contact_email: e.target.value })}
                          disabled={savingBio}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-phone">Contact Phone</Label>
                        <Input
                          id="edit-phone"
                          value={bioData.contact_phone}
                          onChange={(e) => setBioData({ ...bioData, contact_phone: e.target.value })}
                          disabled={savingBio}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-address">Address</Label>
                      <Input
                        id="edit-address"
                        value={bioData.address}
                        onChange={(e) => setBioData({ ...bioData, address: e.target.value })}
                        disabled={savingBio}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-national-id">National ID</Label>
                      <Input
                        id="edit-national-id"
                        value={bioData.national_id}
                        onChange={(e) => setBioData({ ...bioData, national_id: e.target.value })}
                        disabled={savingBio}
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        onClick={handleSaveBio}
                        disabled={savingBio || !bioData.firstname.trim() || !bioData.lastname.trim()}
                        size="sm"
                      >
                        {savingBio ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
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
                        <XIcon className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1 md:col-span-2">
                      <div className="text-xs text-muted-foreground">Full Name</div>
                      <div className="text-sm font-medium">{candidate.name}</div>
                    </div>
                    {candidate.date_of_birth && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Date of Birth
                        </div>
                        <div className="text-sm font-medium">
                          {new Date(candidate.date_of_birth).toLocaleDateString()}
                          <span className="text-muted-foreground ml-2">
                            (Age: {calculateAge(candidate.date_of_birth)})
                          </span>
                        </div>
                      </div>
                    )}
                    {candidate.gender && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Gender
                        </div>
                        <div className="text-sm font-medium">{candidate.gender}</div>
                      </div>
                    )}
                    {candidate.programme_code && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <GraduationCap className="h-3 w-3" />
                          Programme Code
                        </div>
                        <div className="text-sm font-medium">{candidate.programme_code}</div>
                      </div>
                    )}
                    {candidate.contact_email && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Contact Email</div>
                        <div className="text-sm font-medium">{candidate.contact_email}</div>
                      </div>
                    )}
                    {candidate.contact_phone && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Contact Phone</div>
                        <div className="text-sm font-medium">{candidate.contact_phone}</div>
                      </div>
                    )}
                    {candidate.address && (
                      <div className="space-y-1 md:col-span-2">
                        <div className="text-xs text-muted-foreground">Address</div>
                        <div className="text-sm font-medium">{candidate.address}</div>
                      </div>
                    )}
                    {candidate.national_id && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">National ID</div>
                        <div className="text-sm font-medium">{candidate.national_id}</div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Registration Date
                      </div>
                      <div className="text-sm font-medium">
                        {new Date(candidate.registration_date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Index Number</div>
                      <div className="text-sm font-medium font-mono">
                        {candidate.index_number || (
                          <span className="text-muted-foreground italic">Not available</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
              </Card>

              {/* Photo Section - Right Corner */}
              <Card className="w-fit shrink-0 flex flex-col">
                <CardHeader className="pb-3">
                </CardHeader>
                <CardContent className="pt-0 flex-1 flex flex-col items-center justify-center gap-3">
                  {loadingPhoto ? (
                    <div className="flex justify-center items-center">
                      <Skeleton className="h-48 w-48 rounded-lg" />
                    </div>
                  ) : photo && photoUrl ? (
                    <>
                      <div
                        className="relative w-48 h-48 border-2 border-primary rounded-lg overflow-hidden bg-muted group cursor-pointer hover:shadow-lg transition-shadow mx-auto"
                        onClick={() => {
                          // Open photo in lightbox/viewer
                          if (photoUrl) {
                            window.open(photoUrl, '_blank');
                          }
                        }}
                      >
                        <img
                          src={photoUrl}
                          alt={candidate.name}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                          <ZoomIn className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="absolute top-2 right-2">
                          <Badge className="bg-primary text-xs">Active</Badge>
                        </div>
                      </div>
                      {!isExamClosed && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setUploadDialogOpen(true)}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Change Photo
                        </Button>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex flex-col items-center justify-center text-muted-foreground w-48 mx-auto">
                        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-12 w-12" />
                        </div>
                        <p className="text-xs mt-2 text-center">No photo available</p>
                      </div>
                      {!isExamClosed && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full"
                          onClick={() => setUploadDialogOpen(true)}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Upload Photo
                        </Button>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Guardian Information Section */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Guardian Information
                  </CardTitle>
                  {!editingGuardian && !isExamClosed && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingGuardian(true)}
                    >
                      <Edit2 className="h-4 w-4 mr-2" />
                      {candidate.guardian_name || candidate.guardian_phone ? "Edit Guardian Info" : "Add Guardian Info"}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {editingGuardian ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-guardian-name">Guardian Name</Label>
                      <Input
                        id="edit-guardian-name"
                        value={guardianData.guardian_name}
                        onChange={(e) => setGuardianData({ ...guardianData, guardian_name: e.target.value })}
                        disabled={savingGuardian}
                        placeholder="Enter guardian full name"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="edit-guardian-phone">Guardian Phone</Label>
                        <Input
                          id="edit-guardian-phone"
                          value={guardianData.guardian_phone}
                          onChange={(e) => setGuardianData({ ...guardianData, guardian_phone: e.target.value })}
                          disabled={savingGuardian}
                          placeholder="+1234567890"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edit-guardian-digital-address">Digital Address</Label>
                        <Input
                          id="edit-guardian-digital-address"
                          value={guardianData.guardian_digital_address}
                          onChange={(e) => setGuardianData({ ...guardianData, guardian_digital_address: e.target.value })}
                          disabled={savingGuardian}
                          placeholder="GA-123-4567"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-guardian-national-id">Guardian National ID</Label>
                      <Input
                        id="edit-guardian-national-id"
                        value={guardianData.guardian_national_id}
                        onChange={(e) => setGuardianData({ ...guardianData, guardian_national_id: e.target.value })}
                        disabled={savingGuardian}
                        placeholder="GHA-123456789-1"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        onClick={handleSaveGuardian}
                        disabled={savingGuardian}
                        size="sm"
                      >
                        {savingGuardian ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
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
                        <XIcon className="h-4 w-4 mr-2" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {candidate.guardian_name ? (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Guardian Name</div>
                        <div className="text-sm font-medium">{candidate.guardian_name}</div>
                      </div>
                    ) : (
                      <div className="space-y-1 md:col-span-2">
                        <div className="text-xs text-muted-foreground italic">No guardian information available</div>
                      </div>
                    )}
                    {candidate.guardian_phone && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Guardian Phone</div>
                        <div className="text-sm font-medium">{candidate.guardian_phone}</div>
                      </div>
                    )}
                    {candidate.guardian_digital_address && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Digital Address</div>
                        <div className="text-sm font-medium">{candidate.guardian_digital_address}</div>
                      </div>
                    )}
                    {candidate.guardian_national_id && (
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground">Guardian National ID</div>
                        <div className="text-sm font-medium">{candidate.guardian_national_id}</div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Subject Registrations Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Registered Subjects
                </h3>
                {candidate?.programme_id && !editingSubjects && !isExamClosed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingSubjects(true)}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Subjects
                  </Button>
                )}
              </div>

              {!editingSubjects ? (
                // Display mode
                subjectSelections.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center text-muted-foreground text-sm py-8">
                        <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No subjects registered for this candidate.</p>
                        {candidate?.programme_id && !isExamClosed && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-4"
                            onClick={() => setEditingSubjects(true)}
                          >
                            <Edit2 className="h-4 w-4 mr-2" />
                            Add Subjects
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      {candidate.exam && (
                        <div>
                          <CardTitle className="text-base">
                            {candidate.exam.exam_type}{candidate.exam.exam_series ? ` ${candidate.exam.exam_series}` : ""} {candidate.exam.year}
                          </CardTitle>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-muted-foreground">
                              {subjectSelections.length} {subjectSelections.length === 1 ? "subject" : "subjects"}
                            </span>
                          </div>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {subjectSelections.map((subject: RegistrationSubjectSelection) => (
                          <div
                            key={subject.id}
                            className="flex items-center justify-between py-2 px-3 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex-1">
                              <div className="font-medium text-sm">{subject.subject_name}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Code: {subject.subject_code}
                                {subject.series && ` • Series ${subject.series}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )
              ) : (
                // Edit mode
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Edit Subject Selections</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Select subjects for {candidate?.name}. Changes will be validated against programme requirements.
                    </p>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {loadingSubjects ? (
                      <div className="flex justify-center py-8">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : programmeSubjects ? (
                      <div className="space-y-6">
                        {/* Compulsory Core Subjects */}
                        {programmeSubjects.compulsory_core.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-base font-medium">Compulsory Core Subjects</Label>
                            <div className="space-y-2 pl-4">
                              {programmeSubjects.compulsory_core.map((subject) => {
                                const isChecked = selectedSubjectIds.includes(subject.subject_id);
                                return (
                                  <div key={subject.subject_id} className="flex items-center gap-2">
                                    <Checkbox checked={isChecked} disabled />
                                    <Label className="font-normal">
                                      {subject.subject_code} - {subject.subject_name}
                                    </Label>
                                    <Badge variant="secondary" className="text-xs">
                                      CORE
                                    </Badge>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Optional Core Groups */}
                        {programmeSubjects.optional_core_groups.length > 0 && (
                          <div className="space-y-3">
                            <Label className="text-base font-medium">Optional Core Groups (Select one per group)</Label>
                            {programmeSubjects.optional_core_groups.map((group) => {
                              const selectedInGroup = selectedSubjectIds.find((id) =>
                                group.subjects.some((s) => s.subject_id === id)
                              );
                              return (
                                <div key={group.choice_group_id} className="space-y-2 pl-4 border-l-2">
                                  <Label className="text-sm font-medium">Group {group.choice_group_id}</Label>
                                  <RadioGroup
                                    value={selectedInGroup?.toString()}
                                    onValueChange={(value) =>
                                      handleOptionalGroupChange(group.subjects, parseInt(value))
                                    }
                                  >
                                    {group.subjects.map((subject) => (
                                      <div key={subject.subject_id} className="flex items-center gap-2">
                                        <RadioGroupItem value={subject.subject_id.toString()} id={`edit-group-${group.choice_group_id}-${subject.subject_id}`} />
                                        <Label htmlFor={`edit-group-${group.choice_group_id}-${subject.subject_id}`} className="font-normal cursor-pointer">
                                          {subject.subject_code} - {subject.subject_name}
                                        </Label>
                                        <Badge variant="secondary" className="text-xs">
                                          CORE
                                        </Badge>
                                      </div>
                                    ))}
                                  </RadioGroup>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Elective Subjects */}
                        {programmeSubjects.electives.length > 0 && (() => {
                          const isMayJune = candidate?.exam?.exam_series?.toUpperCase().replace(/[-\s]/g, "/") === "MAY/JUNE";
                          return (
                            <div className="space-y-2">
                              <Label className="text-base font-medium">
                                Elective Subjects {isMayJune ? "(All Required)" : "(Select any)"}
                              </Label>
                              <div className="space-y-2 pl-4">
                                {programmeSubjects.electives.map((subject) => {
                                  const isChecked = selectedSubjectIds.includes(subject.subject_id);
                                  return (
                                    <div key={subject.subject_id} className="flex items-center gap-2">
                                      <Checkbox
                                        checked={isChecked}
                                        disabled={isMayJune}
                                        onCheckedChange={(checked) =>
                                          handleSubjectToggle(subject.subject_id, checked as boolean)
                                        }
                                      />
                                      <Label className={`font-normal ${isMayJune ? "" : "cursor-pointer"}`}>
                                        {subject.subject_code} - {subject.subject_name}
                                      </Label>
                                      <Badge variant="outline" className="text-xs">
                                        ELECTIVE
                                      </Badge>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex justify-end gap-2 pt-4 border-t">
                          <Button variant="outline" onClick={handleCancelEdit} disabled={savingSubjects}>
                            <XIcon className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                          <Button onClick={handleSaveSubjects} disabled={savingSubjects}>
                            {savingSubjects ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="h-4 w-4 mr-2" />
                                Save Changes
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-muted-foreground py-8">
                        <p>No programme subjects available.</p>
                        <Button variant="outline" className="mt-4" onClick={handleCancelEdit}>
                          Cancel
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Footer with Navigation */}
        {candidates.length > 1 && (
          <DialogFooter className="justify-between sm:justify-between px-6 pb-6 pt-4 border-t bg-muted/30">
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <Keyboard className="h-3 w-3" />
              Use ← → to navigate
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevious}
                disabled={!canNavigatePrevious}
                className="h-9 w-9"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[80px] text-center font-medium">
                {positionText}
              </span>
              <Button
                variant="outline"
                size="icon"
                onClick={handleNext}
                disabled={!canNavigateNext}
                className="h-9 w-9"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </DialogFooter>
        )}

        {/* Photo Upload Dialog */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Photo</DialogTitle>
              <DialogDescription>
                Upload a passport photo for {candidate.name}. The photo will be renamed using the registration number ({candidate.registration_number}).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="photo-upload">Select Photo</Label>
                <Input
                  id="photo-upload"
                  type="file"
                  accept="image/jpeg,image/jpg"
                  onChange={handleFileSelect}
                  disabled={uploadingPhoto}
                />
                <p className="text-xs text-muted-foreground">
                  JPEG images only. Dimensions: 155x191 pixels (passport photo standard). Max size: 2MB.
                </p>
              </div>
              {selectedFile && (
                <div className="rounded-md border p-3 bg-muted">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
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
                onClick={() => {
                  setUploadDialogOpen(false);
                  setSelectedFile(null);
                }}
                disabled={uploadingPhoto}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUploadPhoto}
                disabled={!selectedFile || uploadingPhoto}
              >
                {uploadingPhoto ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Photo
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
