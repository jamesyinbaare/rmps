"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  listAvailableExamsForPrivate,
  listExaminationCenters,
  listSubjectsForPrivate,
  listProgrammesForPrivate,
  getProgrammeSubjectsForPrivate,
  saveDraftRegistration,
  getDraftRegistration,
  submitDraftRegistration,
  uploadPrivateCandidatePhoto,
  getPrivateCandidatePhoto,
  getPrivatePhotoFile,
  listMyRegistrations,
  enableEditRegistration,
  getRegistrationForViewing,
  logout,
  getRegistrationPrice,
  initializeRegistrationPayment,
  getRegistrationPaymentStatus,
  type ExaminationCenter,
  type SubjectListItem,
  type ProgrammeListItem,
} from "@/lib/api";
import type { RegistrationExam, RegistrationCandidate } from "@/types";
import { toast } from "sonner";
import { Loader2, CheckCircle2, LogOut, User, Calendar, GraduationCap, BookOpen, Building2, Copy, AlertTriangle, AlertCircle, XCircle, Edit2, Plus, Clock, CheckCircle, FileText, Receipt } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { PrivateSubjectSelection } from "@/components/registration/PrivateSubjectSelection";

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const STEPS = [
  { number: 1, title: "Select Exam" },
  { number: 2, title: "Select Center" },
  { number: 3, title: "Bio Data" },
  { number: 4, title: "Subjects" },
  { number: 5, title: "Payment" },
  { number: 6, title: "Documents & Photo" },
  { number: 7, title: "Review" },
];

// Phone formatting functions
const formatPhoneForDisplay = (phone: string): string => {
  // Remove all spaces first
  const digits = phone.replace(/\s/g, "");
  // Format as XXX XXX XXXX (3-3-4)
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 10)}`;
};

const stripPhoneFormatting = (phone: string): string => {
  return phone.replace(/\s/g, "");
};

const validateGhanaPhone = (phone: string): { isValid: boolean; error?: string } => {
  const stripped = stripPhoneFormatting(phone);
  if (!stripped) {
    return { isValid: false, error: "Phone number is required" };
  }
  // Ghana phone format: 10 digits starting with 0
  if (!/^0\d{9}$/.test(stripped)) {
    return { isValid: false, error: "Phone number must be 10 digits starting with 0 (e.g., 0554210052)" };
  }
  return { isValid: true };
};

export default function PrivateRegistrationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [draftId, setDraftId] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());
  const [loadedDraft, setLoadedDraft] = useState<RegistrationCandidate | null>(null);
  const [examLocked, setExamLocked] = useState(false);
  const [showExamConfirmDialog, setShowExamConfirmDialog] = useState(false);
  const [pendingExamId, setPendingExamId] = useState<number | null>(null);
  const [existingRegistrations, setExistingRegistrations] = useState<RegistrationCandidate[]>([]);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);

  // Step 1: Exam
  const [exams, setExams] = useState<RegistrationExam[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<number | null>(null);

  // Step 2: Examination Center
  const [examinationCenters, setExaminationCenters] = useState<ExaminationCenter[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState<number | null>(null);

  // Step 3: Bio Data
  const [firstname, setFirstname] = useState("");
  const [lastname, setLastname] = useState("");
  const [othername, setOthername] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [disability, setDisability] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [guardianDigitalAddress, setGuardianDigitalAddress] = useState("");
  const [guardianNationalId, setGuardianNationalId] = useState("");

  // Step 4: Subject Selection
  const [programmeId, setProgrammeId] = useState<number | null>(null);
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<number[]>([]);
  const [programmes, setProgrammes] = useState<ProgrammeListItem[]>([]);
  const [allSubjects, setAllSubjects] = useState<SubjectListItem[]>([]);

  // Step 5: Payment
  const [priceData, setPriceData] = useState<{
    application_fee: number;
    subject_price: number | null;
    tiered_price: number | null;
    total: number;
    pricing_model_used: string;
    payment_required: boolean;
    has_pricing: boolean;
    total_paid_amount: number;
    outstanding_amount: number;
  } | null>(null);
  const [paymentAcknowledged, setPaymentAcknowledged] = useState(false);
  const [loadingPrice, setLoadingPrice] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);

  // Step 6: Documents & Photo
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [hasExistingPhoto, setHasExistingPhoto] = useState(false);

  // Load exams and check for draft on mount
  useEffect(() => {
    const initializePage = async () => {
      await loadExams();
      const regs = await loadExistingRegistrations();
      const registrationIdParam = searchParams.get("registration_id");
      const examIdParam = searchParams.get("exam_id");
      const registrationNumberParam = searchParams.get("registration_number");

      if (registrationIdParam) {
        // Load registration by ID (new primary method)
        const registrationId = parseInt(registrationIdParam);
        if (!isNaN(registrationId)) {
          await loadRegistrationById(registrationId);
        } else {
          toast.error("Invalid registration ID");
          router.push("/dashboard/private");
        }
      } else if (registrationNumberParam) {
        // Load submitted registration for editing using registration number (backward compatibility)
        loadSubmittedRegistrationByNumber(registrationNumberParam);
        setShowRegistrationForm(true);
      } else if (examIdParam) {
        // Load draft for specific exam (for continuing draft)
        setSelectedExamId(parseInt(examIdParam));
        loadDraft(parseInt(examIdParam));
        setShowRegistrationForm(true);
      } else {
        // No params: Show empty form for new registration
        // Don't auto-load draft - user should select exam
        setShowRegistrationForm(true);
      }
    };
    initializePage();
  }, [searchParams]);

  const loadExistingRegistrations = async () => {
    try {
      const regs = await listMyRegistrations();
      // Include all registrations (DRAFT, PENDING, APPROVED, REJECTED)
      setExistingRegistrations(regs);
      return regs;
    } catch (error) {
      console.error("Failed to load existing registrations:", error);
      return [];
    }
  };

  // Load examination centers when exam is selected
  useEffect(() => {
    if (selectedExamId) {
      loadExaminationCenters(selectedExamId);
    }
  }, [selectedExamId]);

  // Load all subjects for review step
  useEffect(() => {
    const loadSubjects = async () => {
      try {
        const subjects = await listSubjectsForPrivate();
        setAllSubjects(subjects);
      } catch (error) {
        console.error("Failed to load subjects:", error);
      }
    };
    loadSubjects();
  }, []);

  // Update completed steps based on current data
  useEffect(() => {
    const completed = new Set<Step>();
    if (selectedExamId) completed.add(1);
    if (selectedSchoolId) completed.add(2);
    if (firstname && firstname.trim() !== "" && lastname && lastname.trim() !== "") completed.add(3);
    if (selectedSubjectIds.length > 0) completed.add(4);
    // Step 5 (payment) - check if payment is completed
    if (priceData && priceData.outstanding_amount <= 0) completed.add(5);
    // Step 6 (photo) is optional, but if we have a photo file, preview, or existing photo, mark it as completed
    if (photoFile || photoPreview || hasExistingPhoto) completed.add(6);
    // Step 7 (review) is accessible if payment is completed
    if (completed.has(5)) completed.add(7);
    setCompletedSteps(completed);
  }, [selectedExamId, selectedSchoolId, firstname, lastname, selectedSubjectIds, photoFile, photoPreview, hasExistingPhoto, priceData]);

  const loadExams = async () => {
    setLoadingData(true);
    try {
      const examsData = await listAvailableExamsForPrivate();
      setExams(examsData);
    } catch (error) {
      toast.error("Failed to load exams");
      console.error(error);
    } finally {
      setLoadingData(false);
    }
  };

  const loadExaminationCenters = async (examId?: number) => {
    const examIdToUse = examId || selectedExamId;
    if (!examIdToUse) return;

    try {
      const centers = await listExaminationCenters(examIdToUse);
      setExaminationCenters(centers);
    } catch (error) {
      toast.error("Failed to load examination centers");
      console.error(error);
    }
  };

  const loadSubmittedRegistrationByNumber = async (registrationNumber: string) => {
    try {
      setLoadingData(true);
      // Fetch all registrations to find the one with matching registration number
      const regs = await listMyRegistrations();
      const registration = regs.find((r) => r.registration_number === registrationNumber);

      if (!registration) {
        toast.error("Registration not found");
        return;
      }

      // Check if registration period is closed
      const period = registration.exam?.registration_period;
      const periodClosed = period ? new Date(period.registration_end_date) < new Date() : false;

      let updatedRegistration: RegistrationCandidate;
      if (periodClosed) {
        // Use view-only endpoint when period is closed
        updatedRegistration = await getRegistrationForViewing(registration.id);
        setIsReadOnly(true);
        toast.success("Registration loaded (read-only mode - registration period has ended)");
      } else {
        // Enable editing (converts submitted registration back to DRAFT if needed)
        try {
          updatedRegistration = await enableEditRegistration(registration.id);
          setIsReadOnly(false);
          toast.success("Registration loaded for editing");
        } catch (error) {
          // If editing fails, fall back to view-only mode
          updatedRegistration = await getRegistrationForViewing(registration.id);
          setIsReadOnly(true);
          toast.success("Registration loaded (read-only mode)");
        }
      }

      // Load registration data into form
      if (updatedRegistration.registration_exam_id) {
        if (isReadOnly) {
          // In read-only mode, load data directly from the registration
          await loadRegistrationData(updatedRegistration, true);

          // Load photo if exists
          if (updatedRegistration.id) {
            try {
              const photo = await getPrivateCandidatePhoto(updatedRegistration.id);
              if (photo) {
                setHasExistingPhoto(true);
                try {
                  const photoUrl = await getPrivatePhotoFile(updatedRegistration.id);
                  if (photoUrl) {
                    setPhotoPreview(photoUrl);
                  }
                } catch (error) {
                  console.log("Photo exists but couldn't load preview:", error);
                }
              }
            } catch (error) {
              console.log("No existing photo found or couldn't check:", error);
            }
          }

          // Load price data if available
          if (updatedRegistration.id) {
            try {
              const price = await getRegistrationPrice(updatedRegistration.id);
              setPriceData(price);
            } catch (error) {
              console.error("Failed to load price:", error);
            }
          }
        } else {
          // In edit mode, use the normal draft loading
          await loadDraft(updatedRegistration.registration_exam_id);
        }
      } else {
        toast.error("Could not determine exam for this registration");
      }
    } catch (error) {
      console.error("Failed to load submitted registration:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load registration");
    } finally {
      setLoadingData(false);
    }
  };

  const loadRegistrationById = async (registrationId: number) => {
    try {
      setLoadingData(true);
      // Get all registrations to find the one with matching ID
      const regs = await listMyRegistrations();
      const registration = regs.find((r) => r.id === registrationId);

      if (!registration) {
        toast.error("Registration not found");
        router.push("/dashboard/private");
        return;
      }

      // Check if registration period is closed
      const period = registration.exam?.registration_period;
      const periodClosed = period ? new Date(period.registration_end_date) < new Date() : false;

      let updatedRegistration: RegistrationCandidate;
      if (periodClosed) {
        // Use view-only endpoint when period is closed
        updatedRegistration = await getRegistrationForViewing(registration.id);
        setIsReadOnly(true);
        toast.success("Registration loaded (read-only mode - registration period has ended)");
      } else {
        // Enable editing (converts submitted registration back to DRAFT if needed)
        try {
          updatedRegistration = await enableEditRegistration(registration.id);
          setIsReadOnly(false);
          toast.success("Registration loaded for editing");
        } catch (error) {
          // If editing fails, fall back to view-only mode
          updatedRegistration = await getRegistrationForViewing(registration.id);
          setIsReadOnly(true);
          toast.success("Registration loaded (read-only mode)");
        }
      }

      // Load registration data into form
      if (updatedRegistration.registration_exam_id) {
        setShowRegistrationForm(true);
        // Use periodClosed to determine mode since isReadOnly state might not be updated yet
        if (periodClosed || isReadOnly) {
          // In read-only mode, load data directly from the registration
          await loadRegistrationData(updatedRegistration, true);

          // Load photo if exists
          if (updatedRegistration.id) {
            try {
              const photo = await getPrivateCandidatePhoto(updatedRegistration.id);
              if (photo) {
                setHasExistingPhoto(true);
                try {
                  const photoUrl = await getPrivatePhotoFile(updatedRegistration.id);
                  if (photoUrl) {
                    setPhotoPreview(photoUrl);
                  }
                } catch (error) {
                  console.log("Photo exists but couldn't load preview:", error);
                }
              }
            } catch (error) {
              console.log("No existing photo found or couldn't check:", error);
            }
          }

          // Load price data if available
          if (updatedRegistration.id) {
            try {
              const price = await getRegistrationPrice(updatedRegistration.id);
              setPriceData(price);
            } catch (error) {
              console.error("Failed to load price:", error);
            }
          }
        } else {
          // In edit mode, use the normal draft loading
          await loadDraft(updatedRegistration.registration_exam_id);
        }
      } else {
        toast.error("Could not determine exam for this registration");
        router.push("/dashboard/private");
      }
    } catch (error) {
      console.error("Failed to load registration:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load registration");
      router.push("/dashboard/private");
    } finally {
      setLoadingData(false);
    }
  };

  const handleLoadRegistration = async (registration: RegistrationCandidate) => {
    try {
      setLoadingData(true);

      // Check if registration period is closed
      const period = registration.exam?.registration_period;
      const periodClosed = period ? new Date(period.registration_end_date) < new Date() : false;

      let updatedRegistration: RegistrationCandidate;
      if (periodClosed) {
        // Use view-only endpoint when period is closed
        updatedRegistration = await getRegistrationForViewing(registration.id);
        setIsReadOnly(true);
        toast.success("Registration loaded (read-only mode - registration period has ended)");
      } else {
        // Enable editing (converts submitted registration back to DRAFT if needed)
        try {
          updatedRegistration = await enableEditRegistration(registration.id);
          setIsReadOnly(false);
          toast.success("Registration loaded for editing");
        } catch (error) {
          // If editing fails, fall back to view-only mode
          updatedRegistration = await getRegistrationForViewing(registration.id);
          setIsReadOnly(true);
          toast.success("Registration loaded (read-only mode)");
        }
      }

      // Reload registrations list to reflect status changes
      await loadExistingRegistrations();

      // Load registration data into form
      if (updatedRegistration.registration_exam_id) {
        if (isReadOnly) {
          // In read-only mode, load data directly from the registration
          await loadRegistrationData(updatedRegistration, true);

          // Load photo if exists
          if (updatedRegistration.id) {
            try {
              const photo = await getPrivateCandidatePhoto(updatedRegistration.id);
              if (photo) {
                setHasExistingPhoto(true);
                try {
                  const photoUrl = await getPrivatePhotoFile(updatedRegistration.id);
                  if (photoUrl) {
                    setPhotoPreview(photoUrl);
                  }
                } catch (error) {
                  console.log("Photo exists but couldn't load preview:", error);
                }
              }
            } catch (error) {
              console.log("No existing photo found or couldn't check:", error);
            }
          }

          // Load price data if available
          if (updatedRegistration.id) {
            try {
              const price = await getRegistrationPrice(updatedRegistration.id);
              setPriceData(price);
            } catch (error) {
              console.error("Failed to load price:", error);
            }
          }
        } else {
          // In edit mode, use the normal draft loading
          await loadDraft(updatedRegistration.registration_exam_id);
        }
      } else {
        toast.error("Could not determine exam for this registration");
      }
    } catch (error) {
      console.error("Failed to load registration:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load registration");
    } finally {
      setLoadingData(false);
    }
  };

  const handleStartNewRegistration = () => {
    // Clear current state
    setDraftId(null);
    setLoadedDraft(null);
    setSelectedExamId(null);
    setSelectedSchoolId(null);
    setFirstname("");
    setLastname("");
    setOthername("");
    setDateOfBirth("");
    setGender("");
    setContactEmail("");
    setContactPhone("");
    setAddress("");
    setNationalId("");
    setDisability("");
    setGuardianName("");
    setGuardianPhone("");
    setGuardianDigitalAddress("");
    setGuardianNationalId("");
    setProgrammeId(null);
    setSelectedSubjectIds([]);
    setPhotoFile(null);
    setPhotoPreview(null);
    setHasExistingPhoto(false);
    setPriceData(null);
    setPaymentAcknowledged(false);
    setExamLocked(false);
    setCurrentStep(1);
    setCompletedSteps(new Set());
    setIsReadOnly(false);
    setShowRegistrationForm(true);

    // Load a fresh draft
    loadDraft();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "DRAFT":
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            <Clock className="mr-1 h-3 w-3" />
            Draft
          </span>
        );
      case "PENDING":
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </span>
        );
      case "APPROVED":
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircle className="mr-1 h-3 w-3" />
            Approved
          </span>
        );
      case "REJECTED":
        return (
          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
            <XCircle className="mr-1 h-3 w-3" />
            Rejected
          </span>
        );
      default:
        return null;
    }
  };

  const loadRegistrationData = async (registration: RegistrationCandidate, readOnly: boolean = false) => {
    // Populate all form fields from registration data
    setDraftId(registration.id);
    setLoadedDraft(registration);
    setSelectedExamId(registration.registration_exam_id);
    setSelectedSchoolId(registration.school_id || null);

    // Load examination centers if exam is selected
    if (registration.registration_exam_id) {
      await loadExaminationCenters(registration.registration_exam_id);
    }
    setFirstname(registration.firstname || "");
    setLastname(registration.lastname || "");
    setOthername(registration.othername || "");
    setDateOfBirth(registration.date_of_birth || "");
    setGender(registration.gender || "");
    setContactEmail(registration.contact_email || "");
    setContactPhone(registration.contact_phone ? formatPhoneForDisplay(registration.contact_phone) : "");
    setAddress(registration.address || "");
    setNationalId(registration.national_id || "");
    setDisability(registration.disability || "");
    setGuardianName(registration.guardian_name || "");
    setGuardianPhone(registration.guardian_phone ? formatPhoneForDisplay(registration.guardian_phone) : "");
    setGuardianDigitalAddress(registration.guardian_digital_address || "");
    setGuardianNationalId(registration.guardian_national_id || "");
    setProgrammeId(registration.programme_id || null);
    setSelectedSubjectIds(
      registration.subject_selections?.map((s) => s.subject_id).filter((id): id is number => id !== null) || []
    );

    // Lock exam if registration has been saved
    if (registration.id && registration.registration_exam_id) {
      setExamLocked(true);
    }

    // Determine the highest completed step
    let highestStep: Step = 1;
    if (registration.registration_exam_id) highestStep = 1;
    if (registration.school_id) highestStep = 2;
    if (registration.firstname && registration.firstname.trim() !== "" && registration.lastname && registration.lastname.trim() !== "") highestStep = 3;
    if (registration.subject_selections && registration.subject_selections.length > 0) highestStep = 4;

    // For read-only mode, allow viewing all steps
    if (readOnly && registration.subject_selections && registration.subject_selections.length > 0) {
      highestStep = 7; // Allow viewing all steps including review
    } else if (registration.subject_selections && registration.subject_selections.length > 0) {
      highestStep = 5; // Payment step
    }

    setCurrentStep(highestStep);

    // Update completed steps
    const completed = new Set<Step>();
    if (registration.registration_exam_id) completed.add(1);
    if (registration.school_id) completed.add(2);
    if (registration.firstname && registration.firstname.trim() !== "" && registration.lastname && registration.lastname.trim() !== "") completed.add(3);
    if (registration.subject_selections && registration.subject_selections.length > 0) completed.add(4);
    if (registration.subject_selections && registration.subject_selections.length > 0) completed.add(5); // Payment step
    if (registration.subject_selections && registration.subject_selections.length > 0) completed.add(6); // Photo step
    if (registration.subject_selections && registration.subject_selections.length > 0) completed.add(7); // Review step
    setCompletedSteps(completed);
  };

  const loadDraft = async (examId?: number) => {
    try {
      const draft = await getDraftRegistration(examId);
      if (draft) {
        setDraftId(draft.id);
        setLoadedDraft(draft);
        setSelectedExamId(draft.registration_exam_id);
        setSelectedSchoolId(draft.school_id || null);
        setFirstname(draft.firstname || "");
        setLastname(draft.lastname || "");
        setOthername(draft.othername || "");
        setDateOfBirth(draft.date_of_birth || "");
        setGender(draft.gender || "");
        setContactEmail(draft.contact_email || "");
        setContactPhone(draft.contact_phone ? formatPhoneForDisplay(draft.contact_phone) : "");
        setAddress(draft.address || "");
        setNationalId(draft.national_id || "");
        setDisability(draft.disability || "");
        setGuardianName(draft.guardian_name || "");
        setGuardianPhone(draft.guardian_phone ? formatPhoneForDisplay(draft.guardian_phone) : "");
        setGuardianDigitalAddress(draft.guardian_digital_address || "");
        setGuardianNationalId(draft.guardian_national_id || "");
        setProgrammeId(draft.programme_id || null);
        setSelectedSubjectIds(
          draft.subject_selections?.map((s) => s.subject_id).filter((id): id is number => id !== null) || []
        );

        // Lock exam if draft has been saved (has an ID and exam is set)
        if (draft.id && draft.registration_exam_id) {
          setExamLocked(true);
        }

        // Check if photo exists for this draft using private endpoints
        if (draft.id) {
          try {
            const photo = await getPrivateCandidatePhoto(draft.id);
            if (photo) {
              setHasExistingPhoto(true);
              // Try to load photo preview
              try {
                const photoUrl = await getPrivatePhotoFile(draft.id);
                if (photoUrl) {
                  setPhotoPreview(photoUrl);
                }
              } catch (error) {
                // Photo file couldn't be loaded, but photo exists
                console.log("Photo exists but couldn't load preview:", error);
              }
            }
          } catch (error) {
            // No photo exists or couldn't check - that's okay
            console.log("No existing photo found or couldn't check:", error);
          }
        }

        // Determine the highest completed step and set current step
        let highestStep: Step = 1;
        if (draft.registration_exam_id) highestStep = 1;
        if (draft.school_id) highestStep = 2;
        if (draft.firstname && draft.firstname.trim() !== "" && draft.lastname && draft.lastname.trim() !== "") highestStep = 3;
        if (draft.subject_selections && draft.subject_selections.length > 0) highestStep = 4;

        // Check payment status if we have subjects
        if (draft.subject_selections && draft.subject_selections.length > 0 && draft.id) {
          try {
            const price = await getRegistrationPrice(draft.id);
            setPriceData(price);
            if (!price.has_pricing) {
              // Skip payment step if pricing is not configured
              highestStep = 6; // Skip to photo step
            } else if (price.outstanding_amount <= 0) {
              highestStep = 5; // Payment completed, can proceed to photo step
            } else {
              highestStep = 5; // Show payment step if outstanding
            }
          } catch (error) {
            console.error("Failed to load price:", error);
            // If price loading fails, assume no pricing and skip payment step
            highestStep = 6;
          }
        } else if (highestStep >= 4) {
          // If subjects selected but no price data yet, check if pricing is configured
          // For now, default to showing payment step (will be skipped if no pricing)
          highestStep = 5;
        }

        // If all required data and payment is complete (or not required), allow up to review step (7)
        if (draft.registration_exam_id && draft.school_id && draft.firstname &&
            draft.firstname.trim() !== "" && draft.lastname && draft.lastname.trim() !== "" &&
            draft.subject_selections && draft.subject_selections.length > 0) {
          try {
            if (draft.id) {
              const price = await getRegistrationPrice(draft.id);
              if (!price.has_pricing || price.outstanding_amount <= 0) {
                highestStep = 7; // All data and payment complete (or not required), allow review
              }
            }
          } catch (error) {
            console.error("Failed to check payment:", error);
            // If price check fails, assume no pricing required and allow review
            highestStep = 7;
          }
        }

        setCurrentStep(highestStep);
        toast.success("Draft registration loaded");
      }
    } catch (error) {
      console.error("Failed to load draft:", error);
    }
  };

  const saveDraft = async () => {
    if (!selectedExamId) {
      toast.error("Please select an exam first");
      return;
    }

    setSaving(true);
    try {
      const candidateData = {
        firstname: firstname || "Draft",
        lastname: lastname || "Draft",
        othername: othername || null,
        disability: disability || null,
        registration_type: "private",
        guardian_name: guardianName || null,
        guardian_phone: guardianPhone ? stripPhoneFormatting(guardianPhone) : null,
        guardian_digital_address: guardianDigitalAddress || null,
        guardian_national_id: guardianNationalId || null,
        date_of_birth: dateOfBirth || undefined,
        gender: gender || undefined,
        contact_email: contactEmail || undefined,
        contact_phone: contactPhone ? stripPhoneFormatting(contactPhone) : undefined,
        address: address || undefined,
        national_id: nationalId || undefined,
        programme_id: programmeId || undefined,
        school_id: selectedSchoolId || undefined,
        subject_ids: selectedSubjectIds,
      };

      const draft = await saveDraftRegistration(selectedExamId, candidateData);
      setDraftId(draft.id);

      // Lock exam selection after first save
      if (draft.id && draft.registration_exam_id) {
        setExamLocked(true);
      }

      // Upload photo if provided
      if (photoFile && draft.id) {
        try {
          await uploadPrivateCandidatePhoto(draft.id, photoFile);
          setHasExistingPhoto(true);
          // Clear photoFile but keep preview for UI
          setPhotoFile(null);
          toast.success("Progress and photo saved");
        } catch (error) {
          console.error("Failed to upload photo:", error);
          toast.success("Progress saved, but photo upload failed");
        }
      } else {
        toast.success("Progress saved");
      }
    } catch (error) {
      toast.error("Failed to save progress");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    // Validate current step
    if (currentStep === 1 && !selectedExamId) {
      toast.error("Please select an exam");
      return;
    }
    if (currentStep === 2 && !selectedSchoolId) {
      toast.error("Please select an examination center");
      return;
    }
    if (currentStep === 3) {
      if (!firstname || !lastname) {
        toast.error("Please enter your first and last name");
        return;
      }
      if (!dateOfBirth) {
        toast.error("Date of birth is required");
        return;
      }
      if (!gender) {
        toast.error("Gender is required");
        return;
      }
      if (!contactEmail) {
        toast.error("Contact email is required");
        return;
      }
      if (!contactPhone) {
        toast.error("Contact phone is required");
        return;
      }
      if (!address) {
        toast.error("Address is required");
        return;
      }
      if (!nationalId) {
        toast.error("National ID is required");
        return;
      }
      if (!guardianName) {
        toast.error("Guardian name is required");
        return;
      }
      if (!guardianPhone) {
        toast.error("Guardian phone is required");
        return;
      }
    }
    if (currentStep === 4) {
      const exam = exams.find((e) => e.id === selectedExamId);
      const isNovDec = exam?.exam_series?.toUpperCase().replace(/[-\s]/g, "/") === "NOV/DEC";
      if (isNovDec && !programmeId) {
        toast.error("Programme selection is required for NOV/DEC exams");
        return;
      }
      if (selectedSubjectIds.length === 0) {
        toast.error("Please select at least one subject");
        return;
      }
    }

    // Save draft before moving to next step (this now includes photo upload)
    // Only save if we have an existing draft OR if we're past step 2 (where school is selected)
    // Backend requires school_id for NEW drafts
    if (draftId || currentStep >= 2) {
      await saveDraft();
    }

    // Only advance if save was successful (saveDraft handles errors internally)
    // Don't advance past step 7 (review) - user can submit from there
    if (currentStep < 7) {
      setCurrentStep((currentStep + 1) as Step);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as Step);
    }
  };

  const handleStepClick = async (stepNumber: Step) => {
    // In read-only mode, allow navigation but don't save
    if (isReadOnly) {
      if (stepNumber === currentStep) return;
      // Allow navigation to any step in read-only mode
      setCurrentStep(stepNumber);
      return;
    }

    // Only allow navigation to completed steps or the current step
    if (stepNumber === currentStep) return;

    // Check if step is accessible (completed or is step 1)
    if (stepNumber === 1 || completedSteps.has(stepNumber) || stepNumber < currentStep) {
      // Save draft before navigating to a different step
      // Only save if we have an existing draft OR if we're past step 2 (where school is selected)
      // Backend requires school_id for NEW drafts
      if (selectedExamId && (draftId || currentStep >= 2)) {
        await saveDraft();
      }
      setCurrentStep(stepNumber);
    }
  };

  const handleSaveAndExit = async () => {
    if (!selectedExamId) {
      toast.error("Please select an exam first");
      return;
    }

    setSaving(true);
    try {
      // Only save if we have an existing draft OR if we're past step 2 (where school is selected)
      // Backend requires school_id for NEW drafts
      if (draftId || currentStep >= 2) {
        await saveDraft();
      }
      toast.success("Progress saved. Logging out...");
      // Logout the user
      await logout();
      // Redirect to home page for private users
      router.push("/");
    } catch (error) {
      toast.error("Failed to save progress");
      console.error(error);
      setSaving(false);
    }
  };

  // Load price data when entering payment step
  useEffect(() => {
    if (currentStep === 5 && draftId) {
      loadPriceData();
    }
  }, [currentStep, draftId]);

  // Skip payment step if pricing is not configured
  useEffect(() => {
    if (currentStep === 5 && priceData && !priceData.has_pricing) {
      setCurrentStep(6);
    }
  }, [currentStep, priceData]);

  const loadPriceData = async () => {
    if (!draftId) return;
    setLoadingPrice(true);
    try {
      const price = await getRegistrationPrice(draftId);
      setPriceData(price);
    } catch (error) {
      toast.error("Failed to load price information");
      console.error(error);
    } finally {
      setLoadingPrice(false);
    }
  };

  const handleProceedToPayment = async () => {
    if (!draftId) {
      toast.error("No draft registration found");
      return;
    }

    if (!paymentAcknowledged) {
      toast.error("Please acknowledge the non-refundable policy");
      return;
    }

    setProcessingPayment(true);
    try {
      const paymentResult = await initializeRegistrationPayment(draftId);
      // Redirect to Paystack payment page
      window.location.href = paymentResult.authorization_url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to initialize payment");
      console.error(error);
      setProcessingPayment(false);
    }
  };

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Photo must be less than 5MB");
        return;
      }
      setPhotoFile(file);
      setHasExistingPhoto(false); // New photo will replace existing one
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!draftId) {
      toast.error("No draft registration found");
      return;
    }

    // Check payment status before submission
    try {
      const paymentStatus = await getRegistrationPaymentStatus(draftId);
      if (paymentStatus.outstanding_amount > 0) {
        toast.error(`Payment required. Outstanding amount: ${paymentStatus.outstanding_amount.toFixed(2)} GHS. Please complete payment first.`);
        setCurrentStep(5); // Navigate to payment step
        return;
      }
    } catch (error) {
      console.error("Failed to check payment status:", error);
      // Continue with submission attempt - backend will validate
    }

    setLoading(true);
    try {
      // Upload photo if provided (in case it wasn't uploaded during save)
      if (photoFile && draftId) {
        try {
          await uploadPrivateCandidatePhoto(draftId, photoFile);
        } catch (error) {
          console.error("Failed to upload photo:", error);
          // Continue with submission even if photo upload fails
        }
      }

      // Submit draft
      await submitDraftRegistration(draftId);
      toast.success("Registration submitted successfully!");
      router.push("/dashboard/private");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to submit registration";
      toast.error(errorMessage);
      // If payment error, navigate to payment step
      if (errorMessage.includes("Payment required") || errorMessage.includes("outstanding")) {
        setCurrentStep(5);
      }
    } finally {
      setLoading(false);
    }
  };

  const progress = ((currentStep - 1) / 7) * 100;

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-8 flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            onClick={() => router.push("/dashboard/private")}
            className="flex items-center gap-2"
          >
            <LogOut className="h-4 w-4 rotate-180" />
            Back to Dashboard
          </Button>
          <div>
            <h1 className="text-3xl font-bold mb-2">Examination Registration</h1>
            <p className="text-muted-foreground">Complete your registration step by step</p>
          </div>
        </div>
      </div>

      {/* Show registration form - always show when on this page */}
      {!loadingData && (
      <div>
      {/* Read-Only Mode - Show All Information */}
      {isReadOnly ? (
        <div className="space-y-6">
          {/* Read-Only Mode Alert */}
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="flex-1">
                  <h4 className="font-semibold text-amber-900 dark:text-amber-100 mb-1">
                    Read-Only Mode
                  </h4>
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    The registration period has ended. You can view your registration details but cannot make changes.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Registration Overview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Registration Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Registration Number</div>
                  <div className="font-mono font-semibold text-lg">{loadedDraft?.registration_number}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Status</div>
                  <div>{loadedDraft ? getStatusBadge(loadedDraft.registration_status) : null}</div>
                </div>
                {loadedDraft?.index_number && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Index Number</div>
                    <div className="font-mono font-semibold">{loadedDraft.index_number}</div>
                  </div>
                )}
                {loadedDraft?.registration_date && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Registration Date</div>
                    <div>{new Date(loadedDraft.registration_date).toLocaleDateString()}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Exam Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Examination Details
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(() => {
                  const exam = exams.find((e) => e.id === selectedExamId) || loadedDraft?.exam;
                  return exam ? (
                    <>
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Examination Type</div>
                        <div className="font-medium">{exam.exam_type}</div>
                      </div>
                      {exam.exam_series && (
                        <div>
                          <div className="text-sm text-muted-foreground mb-1">Series</div>
                          <div className="font-medium">{exam.exam_series}</div>
                        </div>
                      )}
                      <div>
                        <div className="text-sm text-muted-foreground mb-1">Year</div>
                        <div className="font-medium">{exam.year}</div>
                      </div>
                    </>
                  ) : null;
                })()}
                {(() => {
                  // Try to get school from loadedDraft first, then from examinationCenters
                  const schoolFromDraft = (loadedDraft as any)?.school;
                  const center = schoolFromDraft
                    ? { name: schoolFromDraft.name, code: schoolFromDraft.code }
                    : examinationCenters.find((c) => c.id === selectedSchoolId);
                  return center ? (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Examination Center</div>
                      <div className="font-medium">{center.name} {center.code && `(${center.code})`}</div>
                    </div>
                  ) : null;
                })()}
              </div>
            </CardContent>
          </Card>

          {/* Personal Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="h-5 w-5" />
                Personal Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground mb-1">Full Name</div>
                  <div className="font-medium">{loadedDraft?.name || `${firstname} ${othername ? othername + " " : ""}${lastname}`.trim()}</div>
                </div>
                {dateOfBirth && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Date of Birth</div>
                    <div className="font-medium">{new Date(dateOfBirth).toLocaleDateString()}</div>
                  </div>
                )}
                {gender && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Gender</div>
                    <div className="font-medium">{gender}</div>
                  </div>
                )}
                {disability && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Disability</div>
                    <div className="font-medium">{disability}</div>
                  </div>
                )}
                {contactEmail && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Email</div>
                    <div className="font-medium">{contactEmail}</div>
                  </div>
                )}
                {contactPhone && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Phone</div>
                    <div className="font-medium">{contactPhone}</div>
                  </div>
                )}
                {address && (
                  <div className="md:col-span-2">
                    <div className="text-sm text-muted-foreground mb-1">Digital Address</div>
                    <div className="font-medium">{address}</div>
                  </div>
                )}
                {nationalId && (
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">National ID</div>
                    <div className="font-medium">{nationalId}</div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Guardian Information */}
          {(guardianName || guardianPhone || guardianDigitalAddress || guardianNationalId) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Guardian Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {guardianName && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Guardian Name</div>
                      <div className="font-medium">{guardianName}</div>
                    </div>
                  )}
                  {guardianPhone && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Guardian Phone</div>
                      <div className="font-medium">{guardianPhone}</div>
                    </div>
                  )}
                  {guardianDigitalAddress && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Guardian Digital Address</div>
                      <div className="font-medium">{guardianDigitalAddress}</div>
                    </div>
                  )}
                  {guardianNationalId && (
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Guardian National ID</div>
                      <div className="font-medium">{guardianNationalId}</div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Programme */}
          {programmeId && (() => {
            const programme = programmes.find((p) => p.id === programmeId);
            return programme ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <GraduationCap className="h-5 w-5" />
                    Programme
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="font-medium">{programme.code} - {programme.name}</div>
                </CardContent>
              </Card>
            ) : null;
          })()}

          {/* Subjects */}
          {(() => {
            // Use subject_selections from loadedDraft if available, otherwise use selectedSubjectIds
            const subjectSelections = loadedDraft?.subject_selections || [];
            const hasSubjectSelections = subjectSelections.length > 0;
            const hasSelectedIds = selectedSubjectIds.length > 0;

            if (!hasSubjectSelections && !hasSelectedIds) return null;

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Registered Subjects ({hasSubjectSelections ? subjectSelections.length : selectedSubjectIds.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {hasSubjectSelections ? (
                      // Use subject_selections from loadedDraft
                      subjectSelections.map((selection: any, index: number) => (
                        <div key={selection.subject_id || index} className="flex items-center justify-between py-2 px-3 rounded-md border bg-card">
                          <div>
                            <div className="font-medium text-sm">{selection.subject_name || 'Unknown Subject'}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              Code: {selection.subject_code || 'N/A'}
                              {selection.series && ` • Series ${selection.series}`}
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      // Fall back to selectedSubjectIds
                      selectedSubjectIds.map((subjectId) => {
                        const subject = allSubjects.find((s) => s.id === subjectId);
                        if (!subject) return null;
                        return (
                          <div key={subjectId} className="flex items-center justify-between py-2 px-3 rounded-md border bg-card">
                            <div>
                              <div className="font-medium text-sm">{subject.name}</div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Code: {subject.code}
                                {subject.subject_type && ` • ${subject.subject_type}`}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Payment Information */}
          {priceData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Receipt className="h-5 w-5" />
                  Payment Information
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {priceData.application_fee > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Application Fee</span>
                      <span className="font-medium">{priceData.application_fee.toFixed(2)} GHS</span>
                    </div>
                  )}
                  {priceData.tiered_price !== null && priceData.tiered_price > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Subject Fees (Tiered)</span>
                      <span className="font-medium">{priceData.tiered_price.toFixed(2)} GHS</span>
                    </div>
                  )}
                  {priceData.subject_price !== null && priceData.subject_price > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Subject Fees (Per Subject)</span>
                      <span className="font-medium">{priceData.subject_price.toFixed(2)} GHS</span>
                    </div>
                  )}
                  <div className="border-t pt-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold">Total Amount</span>
                      <span className="text-lg font-bold">{priceData.total.toFixed(2)} GHS</span>
                    </div>
                  </div>
                  {priceData.total_paid_amount > 0 && (
                    <>
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Amount Paid</span>
                        <span className="text-green-600 font-medium">{priceData.total_paid_amount.toFixed(2)} GHS</span>
                      </div>
                      <div className="flex justify-between items-center font-semibold border-t pt-2 mt-2">
                        <span>Outstanding Amount</span>
                        <span className={priceData.outstanding_amount > 0 ? "text-orange-600" : "text-green-600"}>
                          {priceData.outstanding_amount.toFixed(2)} GHS
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Photo */}
          {(photoPreview || hasExistingPhoto) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Passport Photo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {photoPreview ? (
                  <div className="flex justify-center">
                    <img
                      src={photoPreview}
                      alt="Candidate photo"
                      className="w-48 h-48 object-cover rounded-lg border-2 border-primary"
                    />
                  </div>
                ) : hasExistingPhoto ? (
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                      <User className="h-12 w-12" />
                    </div>
                    <p className="text-sm mt-2">Photo uploaded</p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <>
      {/* Progress Bar */}
      <div className="mb-8">
        <div className="flex justify-between mb-2">
          {STEPS.map((step) => {
            const stepNum = step.number as Step;
            const isCompleted = completedSteps.has(stepNum);
            const isCurrent = stepNum === currentStep;
            const isAccessible = stepNum === 1 || isCompleted || stepNum < currentStep;
            const isClickable = isAccessible && !isCurrent;

            return (
              <div
                key={step.number}
                className={`flex-1 text-center ${
                  stepNum <= currentStep ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <div
                  onClick={() => isClickable && handleStepClick(stepNum)}
                  className={`w-8 h-8 rounded-full mx-auto mb-1 flex items-center justify-center transition-colors ${
                    stepNum < currentStep
                      ? "bg-primary text-primary-foreground"
                      : stepNum === currentStep
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  } ${
                    isClickable ? "cursor-pointer hover:opacity-80" : "cursor-default"
                  }`}
                >
                  {stepNum < currentStep ? <CheckCircle2 className="h-4 w-4" /> : stepNum}
                </div>
                <p className="text-xs">{step.title}</p>
              </div>
            );
          })}
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Step {currentStep}: {STEPS[currentStep - 1].title}</CardTitle>
            {saving && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </div>
            )}
            {!saving && draftId && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <span>Saved</span>
              </div>
            )}
          </div>
          <CardDescription>
            {currentStep === 1 && "Select the examination you want to register for"}
            {currentStep === 2 && "Select your preferred examination center"}
            {currentStep === 3 && "Enter your personal information"}
            {currentStep === 4 && "Select subjects you want to register for"}
            {currentStep === 5 && "Complete payment for your registration"}
            {currentStep === 6 && "Upload your passport photo and documents"}
            {currentStep === 7 && "Review your registration before submitting"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Exam Selection */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="exam">Select Exam *</Label>
                {examLocked && selectedExamId ? (
                  <div className="rounded-md border p-4 bg-muted/50">
                    <div className="flex items-center gap-2 text-sm">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="font-medium">Exam selection is locked</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">
                      The exam has already been selected and saved. Once an examination is selected and saved, it cannot be changed.
                    </p>
                    <div className="mt-3 p-3 bg-background rounded border">
                      <p className="text-sm font-medium">
                        {(() => {
                          // First try to get exam from loaded draft
                          if (loadedDraft?.exam) {
                            return `${loadedDraft.exam.exam_type}${loadedDraft.exam.exam_series ? ` (${loadedDraft.exam.exam_series} ${loadedDraft.exam.year})` : ` ${loadedDraft.exam.year}`}`;
                          }
                          // Otherwise try to find in exams array
                          const exam = exams.find((e) => e.id === selectedExamId);
                          return exam ? `${exam.exam_type}${exam.exam_series ? ` (${exam.exam_series} ${exam.year})` : ` ${exam.year}`}` : "Selected exam";
                        })()}
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <Select
                      value={selectedExamId?.toString() || ""}
                      onValueChange={(value) => {
                        const examId = parseInt(value);
                        if (isNaN(examId)) {
                          console.error("Invalid exam ID:", value);
                          toast.error("Invalid exam selection");
                          return;
                        }
                        // Check if user already has a submitted registration for this exam
                        const existingReg = existingRegistrations.find((r) => r.registration_exam_id === examId);
                        if (existingReg) {
                          toast.error("You already have a submitted registration for this examination. Only one application per examination is allowed.");
                          return;
                        }
                        setPendingExamId(examId);
                        setShowExamConfirmDialog(true);
                      }}
                      disabled={loadingData || examLocked || isReadOnly}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select an exam" />
                      </SelectTrigger>
                      <SelectContent>
                        {exams.map((exam) => {
                          // Check if user already has a submitted registration for this exam
                          const hasExistingReg = existingRegistrations.some((r) => r.registration_exam_id === exam.id);
                          return (
                            <SelectItem
                              key={exam.id}
                              value={exam.id.toString()}
                              disabled={hasExistingReg}
                            >
                              {exam.exam_type}{exam.exam_series ? ` (${exam.exam_series} ${exam.year})` : ` ${exam.year}`}
                              {hasExistingReg && " (Already registered)"}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    {existingRegistrations.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Note: You can only submit one application per examination.
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Examination Center */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="center">Select Examination Center *</Label>
                <Select
                  value={selectedSchoolId?.toString() || ""}
                  onValueChange={(value) => setSelectedSchoolId(parseInt(value))}
                  disabled={loadingData || isReadOnly}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an examination center" />
                  </SelectTrigger>
                  <SelectContent>
                    {examinationCenters.map((center) => (
                      <SelectItem key={center.id} value={center.id.toString()}>
                        {center.name} ({center.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Step 3: Bio Data */}
          {currentStep === 3 && (
            <div className="space-y-4">
              {/* Basic Information Section */}
              <div className="space-y-4">
                <h4 className="font-medium">Basic Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstname">First Name *</Label>
                    <Input
                      id="firstname"
                      value={firstname}
                      onChange={(e) => setFirstname(e.target.value)}
                      placeholder="John"
                      required
                      disabled={isReadOnly}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastname">Last Name *</Label>
                    <Input
                      id="lastname"
                      value={lastname}
                      onChange={(e) => setLastname(e.target.value)}
                      placeholder="Doe"
                      required
                      disabled={isReadOnly}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="othername">Other Name (Optional)</Label>
                  <Input
                    id="othername"
                    value={othername}
                    onChange={(e) => setOthername(e.target.value)}
                    placeholder="Middle name"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dob">Date of Birth *</Label>
                    <Input
                      id="dob"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gender">Gender *</Label>
                    <Select value={gender} onValueChange={setGender} required disabled={isReadOnly}>
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
                <div className="space-y-2">
                  <Label htmlFor="disability">Disability (Optional)</Label>
                  <Select value={disability} onValueChange={setDisability} disabled={isReadOnly}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select disability type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Visual">Visual</SelectItem>
                      <SelectItem value="Auditory">Auditory</SelectItem>
                      <SelectItem value="Physical">Physical</SelectItem>
                      <SelectItem value="Cognitive">Cognitive</SelectItem>
                      <SelectItem value="Speech">Speech</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Contact Information Section */}
              <div className="space-y-4 border-t pt-4">
                <h4 className="font-medium">Contact Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Contact Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                      placeholder="your.email@example.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Contact Phone *</Label>
                    <Input
                      id="phone"
                      value={contactPhone}
                      onChange={(e) => {
                        const formatted = formatPhoneForDisplay(e.target.value);
                        setContactPhone(formatted);
                      }}
                      placeholder="055 421 0052"
                      maxLength={12}
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="address">Digital Address *</Label>
                  <Input
                    id="address"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="GA-123-4567"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nationalId">National ID *</Label>
                  <Input
                    id="nationalId"
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    placeholder="National ID number"
                    required
                  />
                </div>
              </div>

              {/* Guardian Information Section */}
              <div className="space-y-4 border-t pt-4">
                <h4 className="font-medium">Guardian Information (Required)</h4>
                <div className="space-y-2">
                  <Label htmlFor="guardianName">Guardian Name *</Label>
                  <Input
                    id="guardianName"
                    value={guardianName}
                    onChange={(e) => setGuardianName(e.target.value)}
                    placeholder="Guardian full name"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guardianPhone">Guardian Phone *</Label>
                  <Input
                    id="guardianPhone"
                    value={guardianPhone}
                    onChange={(e) => {
                      const formatted = formatPhoneForDisplay(e.target.value);
                      setGuardianPhone(formatted);
                    }}
                    placeholder="055 421 0052"
                    maxLength={12}
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="guardianDigitalAddress">Guardian Digital Address</Label>
                    <Input
                      id="guardianDigitalAddress"
                      value={guardianDigitalAddress}
                      onChange={(e) => setGuardianDigitalAddress(e.target.value)}
                      placeholder="GA-123-4567"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guardianNationalId">Guardian National ID</Label>
                    <Input
                      id="guardianNationalId"
                      value={guardianNationalId}
                      onChange={(e) => setGuardianNationalId(e.target.value)}
                      placeholder="GHA-123456789-1"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Subject Selection */}
          {currentStep === 4 && selectedExamId && (
            <PrivateSubjectSelection
              programmeId={programmeId}
              selectedSubjectIds={selectedSubjectIds}
              onProgrammeChange={setProgrammeId}
              onSubjectIdsChange={setSelectedSubjectIds}
              examSeries={exams.find((e) => e.id === selectedExamId)?.exam_series}
            />
          )}

          {/* Step 5: Payment */}
          {currentStep === 5 && (
            <div className="space-y-6">
              {loadingPrice ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-muted-foreground">Loading price information...</span>
                </div>
              ) : priceData && priceData.has_pricing ? (
                <>
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Payment Summary</h3>

                    {/* Price Breakdown */}
                    <Card>
                      <CardContent className="pt-6">
                        <div className="space-y-3">
                          {priceData.application_fee > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">Application Fee</span>
                              <span className="font-medium">{priceData.application_fee.toFixed(2)} GHS</span>
                            </div>
                          )}
                          {priceData.tiered_price !== null && priceData.tiered_price > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">
                                Subject Fees ({priceData.pricing_model_used === "tiered" ? "Tiered Pricing" : "Per Subject"})
                              </span>
                              <span className="font-medium">{priceData.tiered_price.toFixed(2)} GHS</span>
                            </div>
                          )}
                          {priceData.subject_price !== null && priceData.subject_price > 0 && (
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-muted-foreground">
                                Subject Fees ({priceData.pricing_model_used === "per_subject" ? "Per Subject" : "Tiered Pricing"})
                              </span>
                              <span className="font-medium">{priceData.subject_price.toFixed(2)} GHS</span>
                            </div>
                          )}
                          <div className="border-t pt-3 mt-3">
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">Total Amount</span>
                              <span className="text-lg font-bold">{priceData.total.toFixed(2)} GHS</span>
                            </div>
                          </div>
                          {priceData.total_paid_amount > 0 && (
                            <>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-muted-foreground">Amount Paid</span>
                                <span className="text-green-600">{priceData.total_paid_amount.toFixed(2)} GHS</span>
                              </div>
                              <div className="flex justify-between items-center font-semibold border-t pt-2 mt-2">
                                <span>Outstanding Amount</span>
                                <span className={priceData.outstanding_amount > 0 ? "text-orange-600" : "text-green-600"}>
                                  {priceData.outstanding_amount.toFixed(2)} GHS
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Non-refundable Notice */}
                    <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950 dark:border-orange-800">
                      <CardContent className="pt-6">
                        <div className="flex items-start gap-3">
                          <AlertTriangle className="h-5 w-5 text-orange-600 shrink-0 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-semibold text-orange-900 dark:text-orange-100 mb-2">
                              Important: Non-Refundable Policy
                            </h4>
                            <p className="text-sm text-orange-800 dark:text-orange-200">
                              All payments are non-refundable. Please review your subject selections carefully before proceeding with payment.
                              If you make changes to your subjects after payment and the new price is higher, you will be required to pay the additional amount.
                            </p>
                          </div>
                        </div>
                        <div className="mt-4 flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="acknowledge-policy"
                            checked={paymentAcknowledged}
                            onChange={(e) => setPaymentAcknowledged(e.target.checked)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                          <label htmlFor="acknowledge-policy" className="text-sm text-orange-800 dark:text-orange-200 cursor-pointer">
                            I acknowledge that all payments are non-refundable and I have reviewed my selections
                          </label>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Payment Status */}
                    {priceData.outstanding_amount <= 0 ? (
                      <Card className="border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800">
                        <CardContent className="pt-6">
                          <div className="flex items-center gap-3">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <div>
                              <h4 className="font-semibold text-green-900 dark:text-green-100">
                                Payment Completed
                              </h4>
                              <p className="text-sm text-green-800 dark:text-green-200">
                                Your registration is fully paid. You can proceed to the next step.
                              </p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="space-y-4">
                        <Button
                          onClick={handleProceedToPayment}
                          disabled={!paymentAcknowledged || processingPayment}
                          className="w-full"
                          size="lg"
                        >
                          {processingPayment ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            `Proceed to Payment - ${priceData.outstanding_amount.toFixed(2)} GHS`
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p>Unable to load price information. Please try again.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 6: Documents & Photo */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="photo">Passport Photo *</Label>
                {hasExistingPhoto && !photoFile && (
                  <div className="mb-2 p-2 bg-muted rounded text-sm text-muted-foreground">
                    You have an existing photo uploaded. Upload a new file to replace it.
                  </div>
                )}
                <Input
                  id="photo"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                />
                {photoPreview && (
                  <div className="mt-4">
                    <img
                      src={photoPreview}
                      alt="Photo preview"
                      className="w-32 h-32 object-cover rounded"
                    />
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Upload a passport-sized photo (max 5MB)
                </p>
              </div>
            </div>
          )}

          {/* Step 7: Review */}
          {currentStep === 7 && (
            <div className="space-y-6">
              {/* Header Section - Similar to Dialog Header */}
              <div className="flex items-start gap-4 pb-4 border-b">
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  {photoPreview ? (
                    <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-primary shrink-0">
                      <img
                        src={photoPreview}
                        alt={loadedDraft?.name || `${firstname} ${othername ? othername + " " : ""}${lastname}`.trim() || "Candidate photo"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <User className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold truncate">
                      {loadedDraft?.name || `${firstname} ${othername ? othername + " " : ""}${lastname}`.trim() || "Draft Registration"}
                    </h2>
                    <div className="mt-1 flex items-center gap-3 flex-wrap">
                      {loadedDraft?.registration_number && (
                        <span className="flex items-center gap-2 text-sm text-muted-foreground">
                          Registration: <span className="font-mono">{loadedDraft.registration_number}</span>
                        </span>
                      )}
                      {programmeId && (() => {
                        const programme = programmes.find((p) => p.id === programmeId);
                        return programme ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs font-medium">
                            <GraduationCap className="h-3 w-3" />
                            {programme.code}
                          </span>
                        ) : null;
                      })()}
                    </div>
                  </div>
                </div>
              </div>

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
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentStep(3)}
                        className="h-8"
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {dateOfBirth && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            Date of Birth
                          </div>
                          <div className="text-sm font-medium">
                            {new Date(dateOfBirth).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                      {gender && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Gender
                          </div>
                          <div className="text-sm font-medium">{gender}</div>
                        </div>
                      )}
                      {programmeId && (() => {
                        const programme = programmes.find((p) => p.id === programmeId);
                        return programme ? (
                          <div className="space-y-1">
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <GraduationCap className="h-3 w-3" />
                              Programme
                            </div>
                            <div className="text-sm font-medium">{programme.code} - {programme.name}</div>
                          </div>
                        ) : null;
                      })()}
                      {contactEmail && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Contact Email</div>
                          <div className="text-sm font-medium">{contactEmail}</div>
                        </div>
                      )}
                      {contactPhone && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Contact Phone</div>
                          <div className="text-sm font-medium">{contactPhone}</div>
                        </div>
                      )}
                      {address && (
                        <div className="space-y-1 md:col-span-2">
                          <div className="text-xs text-muted-foreground">Address</div>
                          <div className="text-sm font-medium">{address}</div>
                        </div>
                      )}
                      {nationalId && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">National ID</div>
                          <div className="text-sm font-medium">{nationalId}</div>
                        </div>
                      )}
                      {disability && (
                        <div className="space-y-1">
                          <div className="text-xs text-muted-foreground">Disability</div>
                          <div className="text-sm font-medium">{disability}</div>
                        </div>
                      )}
                      {(guardianName || guardianPhone || guardianDigitalAddress || guardianNationalId) && (
                        <>
                          <div className="space-y-1 md:col-span-2">
                            <div className="text-xs text-muted-foreground font-medium">Guardian Information</div>
                          </div>
                          {guardianName && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground">Guardian Name</div>
                              <div className="text-sm font-medium">{guardianName}</div>
                            </div>
                          )}
                          {guardianPhone && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground">Guardian Phone</div>
                              <div className="text-sm font-medium">{guardianPhone}</div>
                            </div>
                          )}
                          {guardianDigitalAddress && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground">Guardian Digital Address</div>
                              <div className="text-sm font-medium">{guardianDigitalAddress}</div>
                            </div>
                          )}
                          {guardianNationalId && (
                            <div className="space-y-1">
                              <div className="text-xs text-muted-foreground">Guardian National ID</div>
                              <div className="text-sm font-medium">{guardianNationalId}</div>
                            </div>
                          )}
                        </>
                      )}
                      {(() => {
                        const exam = exams.find((e) => e.id === selectedExamId);
                        return exam ? (
                          <div className="space-y-1 md:col-span-2">
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <BookOpen className="h-3 w-3" />
                              Exam
                            </div>
                            <div className="text-sm font-medium">
                              {exam.exam_type}{exam.exam_series ? ` (${exam.exam_series} ${exam.year})` : ` ${exam.year}`}
                              {exam.description && (
                                <span className="text-muted-foreground ml-2">- {exam.description}</span>
                              )}
                            </div>
                          </div>
                        ) : null;
                      })()}
                      {(() => {
                        const center = examinationCenters.find((c) => c.id === selectedSchoolId);
                        return center ? (
                          <div className="space-y-1 md:col-span-2">
                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              Examination Center
                            </div>
                            <div className="text-sm font-medium">
                              {center.name} {center.code && `(${center.code})`}
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  </CardContent>
                </Card>

                {/* Photo Section - Right Corner */}
                <Card className="w-fit shrink-0 flex flex-col">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Photo</CardTitle>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setCurrentStep(6)}
                        className="h-8"
                      >
                        <Edit2 className="h-4 w-4 mr-2" />
                        Edit
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 flex-1 flex flex-col items-center justify-center gap-3">
                    {photoPreview ? (
                      <div className="relative w-48 h-48 border-2 border-primary rounded-lg overflow-hidden bg-muted mx-auto">
                        <img
                          src={photoPreview}
                          alt={loadedDraft?.name || `${firstname} ${lastname}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : hasExistingPhoto ? (
                      <div className="flex flex-col items-center justify-center text-muted-foreground w-48 mx-auto">
                        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-12 w-12" />
                        </div>
                        <p className="text-xs mt-2 text-center">Photo uploaded</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center text-muted-foreground w-48 mx-auto">
                        <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-12 w-12" />
                        </div>
                        <p className="text-xs mt-2 text-center">No photo available</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Payment Status Section */}
              {priceData && (
                <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950 dark:border-blue-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-1">
                          Payment Status
                        </h4>
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                          {priceData.outstanding_amount <= 0 ? (
                            <>Payment Completed - {priceData.total_paid_amount.toFixed(2)} GHS paid</>
                          ) : (
                            <>Outstanding: {priceData.outstanding_amount.toFixed(2)} GHS</>
                          )}
                        </p>
                      </div>
                      {priceData.outstanding_amount > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentStep(5)}
                        >
                          Complete Payment
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Subject Registrations Section */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <BookOpen className="h-5 w-5" />
                    Registered Subjects
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentStep(4)}
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit Subjects
                  </Button>
                </div>

                {loadedDraft?.subject_selections && loadedDraft.subject_selections.length > 0 ? (
                  <Card>
                    <CardHeader>
                      {(() => {
                        const exam = exams.find((e) => e.id === selectedExamId);
                        return exam ? (
                          <div>
                            <CardTitle className="text-base">
                              {exam.exam_type}{exam.exam_series ? ` ${exam.exam_series}` : ""} {exam.year}
                            </CardTitle>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-muted-foreground">
                                {loadedDraft.subject_selections.length} {loadedDraft.subject_selections.length === 1 ? "subject" : "subjects"}
                              </span>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {loadedDraft.subject_selections.map((subject) => (
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
                ) : selectedSubjectIds.length > 0 ? (
                  <Card>
                    <CardHeader>
                      {(() => {
                        const exam = exams.find((e) => e.id === selectedExamId);
                        return exam ? (
                          <div>
                            <CardTitle className="text-base">
                              {exam.exam_type}{exam.exam_series ? ` ${exam.exam_series}` : ""} {exam.year}
                            </CardTitle>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-xs text-muted-foreground">
                                {selectedSubjectIds.length} {selectedSubjectIds.length === 1 ? "subject" : "subjects"}
                              </span>
                            </div>
                          </div>
                        ) : null;
                      })()}
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {selectedSubjectIds.map((subjectId) => {
                          const subject = allSubjects.find((s) => s.id === subjectId);
                          if (!subject) return null;
                          return (
                            <div
                              key={subjectId}
                              className="flex items-center justify-between py-2 px-3 rounded-md border bg-card hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex-1">
                                <div className="font-medium text-sm">{subject.name}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  Code: {subject.code}
                                  {subject.subject_type && ` • ${subject.subject_type}`}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center text-muted-foreground text-sm py-8">
                        <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>No subjects selected</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4">
            <div>
              {currentStep > 1 && (
                <Button variant="outline" onClick={handlePrevious} disabled={loading || saving || isReadOnly}>
                  Previous
                </Button>
              )}
            </div>
            {!isReadOnly ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={handleSaveAndExit}
                  disabled={loading || saving || !selectedExamId}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <LogOut className="mr-2 h-4 w-4" />
                      Save and Exit
                    </>
                  )}
                </Button>
                {currentStep < 7 ? (
                  <Button onClick={handleNext} disabled={loading || saving || (currentStep === 5 && priceData && priceData.outstanding_amount > 0 && !paymentAcknowledged)}>
                    {saving ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : currentStep === 5 && priceData && priceData.outstanding_amount > 0 ? (
                      "Payment Required"
                    ) : (
                      "Save and Continue"
                    )}
                  </Button>
                ) : (
                  <Button onClick={handleSubmit} disabled={loading || saving}>
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      "Submit Registration"
                    )}
                  </Button>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Read-only mode - changes are disabled
              </div>
            )}
          </div>
        </CardContent>
      </Card>
        </>
      )}
      </div>
      )}

      {/* Exam Selection Confirmation Dialog */}
      <AlertDialog
        open={showExamConfirmDialog}
        onOpenChange={(open) => {
          setShowExamConfirmDialog(open);
          // If dialog is closed without confirming, clear pending exam ID
          if (!open) {
            setPendingExamId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Exam Selection
            </AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2 pt-2">
            <div className="text-sm text-muted-foreground">
              You are about to select an examination. Please note that <strong>once an examination is selected and saved, it cannot be changed</strong>.
            </div>
            {pendingExamId && (() => {
              const exam = exams.find((e) => e.id === pendingExamId);
              return exam ? (
                <div className="mt-4 p-3 bg-muted rounded-md">
                  <div className="text-sm font-medium">Selected Exam:</div>
                  <div className="text-sm">{exam.exam_type} ({exam.exam_series} {exam.year})</div>
                </div>
              ) : null;
            })()}
            <div className="text-sm text-muted-foreground mt-4">
              Are you sure you want to proceed with this selection?
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setPendingExamId(null);
              setShowExamConfirmDialog(false);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingExamId) {
                  setSelectedExamId(pendingExamId);
                  setPendingExamId(null);
                }
                setShowExamConfirmDialog(false);
              }}
            >
              Confirm Selection
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
