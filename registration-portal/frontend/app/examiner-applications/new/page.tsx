"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createExaminerApplication,
  updateExaminerApplication,
  submitExaminerApplication,
  uploadExaminerDocument,
  deleteExaminerDocument,
  getExaminerApplication,
  listExaminerApplications,
  type ExaminerApplication,
  type ExaminerAcademicQualification,
  type ExaminerTeachingExperience,
  type ExaminerWorkExperience,
  type ExaminerExaminingExperience,
  type ExaminerTrainingCourse,
  type ExaminerSubjectPreference,
  type ExaminerApplicationDocument,
} from "@/lib/api";
import { toast } from "sonner";
import {
  Loader2,
  ArrowLeft,
  ArrowRight,
  Plus,
  Trash2,
  Upload,
  X,
  CheckCircle2,
  FileText,
  User,
  GraduationCap,
  Briefcase,
  Award,
  BookOpen,
  FileCheck,
  Eye,
} from "lucide-react";
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

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

const STEPS = [
  { number: 1, title: "Personal Particulars", icon: User, shortTitle: "Personal" },
  { number: 2, title: "Academic Qualifications", icon: GraduationCap, shortTitle: "Qualifications" },
  { number: 3, title: "Teaching Experience", icon: BookOpen, shortTitle: "Teaching" },
  { number: 4, title: "Work Experience", icon: Briefcase, shortTitle: "Work" },
  { number: 5, title: "Examining Experience", icon: Award, shortTitle: "Examining" },
  { number: 6, title: "Training Courses", icon: BookOpen, shortTitle: "Training" },
  { number: 7, title: "Subject Preferences", icon: FileCheck, shortTitle: "Preferences" },
  { number: 8, title: "Documents", icon: FileText, shortTitle: "Documents" },
  { number: 9, title: "Review & Submit", icon: CheckCircle2, shortTitle: "Review" },
];

type QualificationFormData = Omit<ExaminerAcademicQualification, "id" | "application_id">;
type TeachingExperienceFormData = Omit<ExaminerTeachingExperience, "id" | "application_id">;
type WorkExperienceFormData = Omit<ExaminerWorkExperience, "id" | "application_id">;
type ExaminingExperienceFormData = Omit<ExaminerExaminingExperience, "id" | "application_id">;
type TrainingCourseFormData = Omit<ExaminerTrainingCourse, "id" | "application_id">;
type SubjectPreferenceFormData = Omit<ExaminerSubjectPreference, "id" | "application_id">;

export default function NewExaminerApplicationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [applicationId, setApplicationId] = useState<number | null>(null);
  const [application, setApplication] = useState<ExaminerApplication | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<Step>>(new Set());
  const [isLoadingDraft, setIsLoadingDraft] = useState(false);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedRef = useRef<number>(0);

  // Step 1: Personal Particulars
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [nationality, setNationality] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [residentialAddress, setResidentialAddress] = useState("");
  const [emailAddress, setEmailAddress] = useState("");
  const [telephoneOffice, setTelephoneOffice] = useState("");
  const [telephoneCell, setTelephoneCell] = useState("");
  const [presentSchoolInstitution, setPresentSchoolInstitution] = useState("");
  const [presentRankPosition, setPresentRankPosition] = useState("");

  // Step 2: Academic Qualifications
  const [qualifications, setQualifications] = useState<QualificationFormData[]>([]);

  // Step 3: Teaching Experience
  const [teachingExperiences, setTeachingExperiences] = useState<TeachingExperienceFormData[]>([]);

  // Step 4: Work Experience
  const [workExperiences, setWorkExperiences] = useState<WorkExperienceFormData[]>([]);

  // Step 5: Examining Experience
  const [examiningExperiences, setExaminingExperiences] = useState<ExaminingExperienceFormData[]>([]);

  // Step 6: Training Courses
  const [trainingCourses, setTrainingCourses] = useState<TrainingCourseFormData[]>([]);

  // Step 7: Subject Preferences & Additional Info
  const [subjectPreferences, setSubjectPreferences] = useState<SubjectPreferenceFormData[]>([]);
  const [subjectArea, setSubjectArea] = useState("");
  const [additionalInformation, setAdditionalInformation] = useState("");
  const [ceasedExaminingExplanation, setCeasedExaminingExplanation] = useState("");

  // Step 8: Documents
  const [documents, setDocuments] = useState<ExaminerApplicationDocument[]>([]);
  const [uploadingDocument, setUploadingDocument] = useState<string | null>(null);
  const [photographFile, setPhotographFile] = useState<File | null>(null);
  const [certificateFiles, setCertificateFiles] = useState<File[]>([]);
  const [transcriptFiles, setTranscriptFiles] = useState<File[]>([]);

  // Step 9: Review & Submit
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  // Check for existing submitted applications and load draft
  useEffect(() => {
    const checkAndLoad = async () => {
      // First, check if user has any submitted applications
      try {
        const allApplications = await listExaminerApplications();
        const hasSubmitted = allApplications.some(
          app => app.status === "SUBMITTED" || app.status === "UNDER_REVIEW" || app.status === "ACCEPTED"
        );

        if (hasSubmitted && !searchParams.get("draft")) {
          toast.error("You can only submit one application. You already have a submitted application.");
          router.push("/examiner-applications");
          return;
        }
      } catch (error) {
        console.error("Failed to check applications:", error);
      }

      // Load draft if specified
      const draftId = searchParams.get("draft");
      if (draftId && !isNaN(parseInt(draftId))) {
        setIsLoadingDraft(true);
        try {
          const draft = await getExaminerApplication(parseInt(draftId));
          if (draft && draft.status === "DRAFT") {
            setApplicationId(draft.id);
            setApplication(draft);

            // Populate form fields
            setFullName(draft.full_name || "");
            setTitle(draft.title || "");
            setNationality(draft.nationality || "");
            setDateOfBirth(draft.date_of_birth || "");
            setOfficeAddress(draft.office_address || "");
            setResidentialAddress(draft.residential_address || "");
            setEmailAddress(draft.email_address || "");
            setTelephoneOffice(draft.telephone_office || "");
            setTelephoneCell(draft.telephone_cell || "");
            setPresentSchoolInstitution(draft.present_school_institution || "");
            setPresentRankPosition(draft.present_rank_position || "");
            setSubjectArea(draft.subject_area || "");
            setAdditionalInformation(draft.additional_information || "");
            setCeasedExaminingExplanation(draft.ceased_examining_explanation || "");

            // Populate arrays
            setQualifications(draft.qualifications || []);
            setTeachingExperiences(draft.teaching_experiences || []);
            setWorkExperiences(draft.work_experiences || []);
            setExaminingExperiences(draft.examining_experiences || []);
            setTrainingCourses(draft.training_courses || []);
            setSubjectPreferences(draft.subject_preferences || []);
            setDocuments(draft.documents || []);

            // Determine which step to show based on what's filled
            let highestStep: Step = 1;
            if (draft.full_name) highestStep = 2;
            if (draft.qualifications && draft.qualifications.length > 0) highestStep = 3;
            if (draft.teaching_experiences && draft.teaching_experiences.length > 0) highestStep = 4;
            if (draft.work_experiences && draft.work_experiences.length > 0) highestStep = 5;
            if (draft.examining_experiences && draft.examining_experiences.length > 0) highestStep = 6;
            if (draft.training_courses && draft.training_courses.length > 0) highestStep = 7;
            if (draft.subject_preferences && draft.subject_preferences.length > 0) highestStep = 8;
            if (draft.documents && draft.documents.length > 0) highestStep = 9;

            setCurrentStep(highestStep);

            // Mark completed steps
            const completed = new Set<Step>();
            for (let i = 1; i < highestStep; i++) {
              completed.add(i as Step);
            }
            setCompletedSteps(completed);

            toast.success("Draft loaded successfully");
          }
        } catch (error: any) {
          toast.error(error.message || "Failed to load draft");
        } finally {
          setIsLoadingDraft(false);
        }
      }
    };
    checkAndLoad();
  }, [searchParams]);

  const createOrUpdateApplication = async (isDraft = true) => {
    // Check if user already has a submitted application (only when creating new, not updating)
    if (!applicationId) {
      try {
        const allApplications = await listExaminerApplications();
        const hasSubmitted = allApplications.some(
          app => app.status === "SUBMITTED" || app.status === "UNDER_REVIEW" || app.status === "ACCEPTED"
        );

        if (hasSubmitted) {
          toast.error("You can only submit one application. You already have a submitted application.");
          router.push("/examiner-applications");
          throw new Error("User already has a submitted application");
        }
      } catch (error: any) {
        if (error.message === "User already has a submitted application") {
          throw error;
        }
        // Continue if it's just a network error
      }
    }

    const data = {
      full_name: fullName,
      title: title || null,
      nationality: nationality || null,
      date_of_birth: dateOfBirth || null,
      office_address: officeAddress || null,
      residential_address: residentialAddress || null,
      email_address: emailAddress || null,
      telephone_office: telephoneOffice || null,
      telephone_cell: telephoneCell || null,
      present_school_institution: presentSchoolInstitution || null,
      present_rank_position: presentRankPosition || null,
      subject_area: subjectArea || null,
      additional_information: additionalInformation || null,
      ceased_examining_explanation: ceasedExaminingExplanation || null,
      qualifications: qualifications.map((q, idx) => ({
        ...q,
        order_index: idx,
      })),
      teaching_experiences: teachingExperiences.map((t, idx) => ({
        ...t,
        order_index: idx,
      })),
      work_experiences: workExperiences.map((w, idx) => ({
        ...w,
        order_index: idx,
      })),
      examining_experiences: examiningExperiences.map((e, idx) => ({
        ...e,
        order_index: idx,
      })),
      training_courses: trainingCourses.map((t, idx) => ({
        ...t,
        order_index: idx,
      })),
      subject_preferences: subjectPreferences,
    };

    try {
      if (applicationId) {
        const updated = await updateExaminerApplication(applicationId, data);
        setApplication(updated);
        return updated;
      } else {
        const created = await createExaminerApplication(data);
        setApplicationId(created.id);
        setApplication(created);
        return created;
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to save application");
      throw error;
    }
  };

  const saveDraft = useCallback(async (silent = false) => {
    // Don't save if basic info is missing
    if (!fullName.trim()) {
      return;
    }

    // Prevent too frequent saves (throttle to at least 2 seconds apart)
    const now = Date.now();
    if (now - lastSavedRef.current < 2000) {
      return;
    }

    setSaving(true);
    try {
      await createOrUpdateApplication(true);
      lastSavedRef.current = now;
      if (!silent) {
        toast.success("Draft saved", { duration: 2000 });
      }
    } catch (error) {
      // Error already shown in createOrUpdateApplication
      if (!silent) {
        toast.error("Failed to save draft");
      }
    } finally {
      setSaving(false);
    }
  }, [fullName, title, nationality, dateOfBirth, officeAddress, residentialAddress, emailAddress, telephoneOffice, telephoneCell, presentSchoolInstitution, presentRankPosition, subjectArea, additionalInformation, ceasedExaminingExplanation, qualifications, teachingExperiences, workExperiences, examiningExperiences, trainingCourses, subjectPreferences, applicationId]);

  // Auto-save with debouncing
  useEffect(() => {
    // Clear existing timeout
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    // Only auto-save if we have at least a name and an application ID exists or we have enough data
    if (fullName.trim() && (applicationId || fullName.trim().length > 3)) {
      autoSaveTimeoutRef.current = setTimeout(() => {
        saveDraft(true); // Silent save
      }, 3000); // Save 3 seconds after user stops typing
    }

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [fullName, title, nationality, dateOfBirth, officeAddress, residentialAddress, emailAddress, telephoneOffice, telephoneCell, presentSchoolInstitution, presentRankPosition, subjectArea, additionalInformation, ceasedExaminingExplanation, qualifications, teachingExperiences, workExperiences, examiningExperiences, trainingCourses, subjectPreferences, saveDraft, applicationId]);

  // Save draft when navigating away
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (fullName.trim() && applicationId) {
        // Try to save synchronously if possible
        saveDraft(true);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [fullName, applicationId, saveDraft]);

  const handleNext = async () => {
    // Validate current step
    if (!validateCurrentStep()) {
      return;
    }

    // Save draft before moving to next step
    if (currentStep < 9) {
      await saveDraft();
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      setCurrentStep((prev) => Math.min(prev + 1, 9) as Step);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => Math.max(prev - 1, 1) as Step);
    }
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 1:
        if (!fullName.trim()) {
          toast.error("Full name is required");
          return false;
        }
        return true;
      case 2:
        if (qualifications.length === 0) {
          toast.error("At least one academic qualification is required");
          return false;
        }
        for (const q of qualifications) {
          if (!q.university_college.trim() || !q.degree_diploma.trim()) {
            toast.error("All qualifications must have university/college and degree/diploma");
            return false;
          }
        }
        return true;
      case 3:
      case 4:
      case 5:
      case 6:
        // These steps are optional but if entries exist, they should be valid
        return true;
      case 7:
        return true; // Optional
      case 8:
        // Documents are optional but recommended
        return true;
      case 9:
        return true; // Review step
      default:
        return true;
    }
  };

  const handleSubmit = async () => {
    if (!applicationId) {
      toast.error("Please complete all steps first");
      return;
    }

    setSubmitting(true);
    try {
      const response = await submitExaminerApplication(applicationId);
      toast.success("Application submitted successfully!");

      if (response.payment_url) {
        setPaymentUrl(response.payment_url);
        // Redirect to payment
        window.location.href = response.payment_url;
      } else {
        router.push(`/examiner-applications/${applicationId}`);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to submit application");
    } finally {
      setSubmitting(false);
      setShowSubmitDialog(false);
    }
  };

  const handleDocumentUpload = async (file: File, documentType: "PHOTOGRAPH" | "CERTIFICATE" | "TRANSCRIPT") => {
    if (!applicationId) {
      toast.error("Please save the application first");
      return;
    }

    setUploadingDocument(documentType);
    try {
      const uploaded = await uploadExaminerDocument(applicationId, documentType, file);
      setDocuments((prev) => [...prev, uploaded]);

      // Reload application to get updated document list
      if (applicationId) {
        const updated = await getExaminerApplication(applicationId);
        setApplication(updated);
        setDocuments(updated.documents || []);
      }

      toast.success("Document uploaded successfully");

      // Clear file input
      if (documentType === "PHOTOGRAPH") {
        setPhotographFile(null);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to upload document");
    } finally {
      setUploadingDocument(null);
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!applicationId) return;

    try {
      await deleteExaminerDocument(applicationId, documentId);
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));

      // Reload application to get updated document list
      if (applicationId) {
        const updated = await getExaminerApplication(applicationId);
        setApplication(updated);
        setDocuments(updated.documents || []);
      }

      toast.success("Document deleted");
    } catch (error: any) {
      toast.error(error.message || "Failed to delete document");
    }
  };

  // Manual save button handler
  const handleManualSave = async () => {
    if (!fullName.trim()) {
      toast.error("Please enter at least your full name to save");
      return;
    }
    await saveDraft(false);
  };

  // Load documents when application ID is available
  useEffect(() => {
    const loadDocuments = async () => {
      if (applicationId && application) {
        setDocuments(application.documents || []);
      }
    };
    loadDocuments();
  }, [applicationId, application]);

  const progress = (currentStep / STEPS.length) * 100;

  const StepIcon = STEPS[currentStep - 1].icon;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b bg-card/95 backdrop-blur supports-backdrop-filter:bg-card/60">
        <div className="container mx-auto px-4 py-3 sm:py-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0 flex-1">
              <Link href="/examiner-applications">
                <Button variant="ghost" size="sm" className="shrink-0">
                  <ArrowLeft className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Back</span>
                </Button>
              </Link>
              <h1 className="text-base sm:text-xl font-bold truncate">New Examiner Application</h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {saving && (
                <Badge variant="outline" className="gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </Badge>
              )}
              {applicationId && !saving && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualSave}
                  className="hidden sm:flex"
                >
                  <FileText className="h-3 w-3 mr-1.5" />
                  Save Draft
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 max-w-4xl">
        {/* Progress Bar */}
        <div className="mb-4 sm:mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs sm:text-sm font-medium">
              Step {currentStep} of {STEPS.length}
            </span>
            <span className="text-xs sm:text-sm text-muted-foreground">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Step Navigation - Mobile: Select, Desktop: Buttons */}
        <div className="mb-4 sm:mb-6">
          {/* Mobile: Dropdown */}
          <div className="block sm:hidden mb-4">
            <Select
              value={currentStep.toString()}
              onValueChange={(value) => {
                const stepNum = parseInt(value) as Step;
                if (stepNum <= currentStep || completedSteps.has(stepNum)) {
                  setCurrentStep(stepNum);
                }
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {STEPS[currentStep - 1].number}. {STEPS[currentStep - 1].shortTitle}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {STEPS.map((step) => {
                  const Icon = step.icon;
                  const isAccessible = step.number <= currentStep || completedSteps.has(step.number as Step);
                  return (
                    <SelectItem
                      key={step.number}
                      value={step.number.toString()}
                      disabled={!isAccessible}
                      className={!isAccessible ? "opacity-50" : ""}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>
                          {step.number}. {step.title}
                        </span>
                        {completedSteps.has(step.number as Step) && step.number !== currentStep && (
                          <CheckCircle2 className="h-3 w-3 ml-auto text-green-500" />
                        )}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: Button Grid */}
          <div className="hidden sm:flex flex-wrap gap-2">
            {STEPS.map((step) => {
              const Icon = step.icon;
              const isActive = currentStep === step.number;
              const isCompleted = completedSteps.has(step.number as Step);
              const isAccessible = step.number <= currentStep || isCompleted;

              return (
                <Button
                  key={step.number}
                  variant={isActive ? "default" : isCompleted ? "secondary" : "outline"}
                  size="sm"
                  onClick={() => {
                    if (isAccessible) {
                      setCurrentStep(step.number as Step);
                    }
                  }}
                  disabled={!isAccessible}
                  className={`text-xs transition-all ${
                    isActive ? "ring-2 ring-ring" : ""
                  }`}
                >
                  <Icon className="h-3 w-3 mr-1.5" />
                  <span className="hidden md:inline">{step.number}. {step.title}</span>
                  <span className="md:hidden">{step.number}. {step.shortTitle}</span>
                  {isCompleted && !isActive && (
                    <CheckCircle2 className="h-3 w-3 ml-1.5" />
                  )}
                </Button>
              );
            })}
          </div>
        </div>

        {/* Form Content */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4 sm:pb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <StepIcon className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-lg sm:text-xl">{STEPS[currentStep - 1].title}</CardTitle>
                <CardDescription className="mt-1 text-xs sm:text-sm">
                  {currentStep === 1 && "Enter your personal information"}
                  {currentStep === 2 && "List your academic qualifications"}
                  {currentStep === 3 && "List your teaching experience"}
                  {currentStep === 4 && "List your work experience"}
                  {currentStep === 5 && "List your examining experience"}
                  {currentStep === 6 && "List training courses you've attended"}
                  {currentStep === 7 && "Select your subject preferences and provide additional information"}
                  {currentStep === 8 && "Upload required documents"}
                  {currentStep === 9 && "Review your application before submission"}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6 pb-4 sm:pb-6">
            {/* Step 1: Personal Particulars */}
            {currentStep === 1 && (
              <div className="space-y-4 sm:space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="fullName">Full Name *</Label>
                    <Input
                      id="fullName"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter your full name"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="title">Title</Label>
                    <Select value={title} onValueChange={setTitle}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select title" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Mr">Mr</SelectItem>
                        <SelectItem value="Mrs">Mrs</SelectItem>
                        <SelectItem value="Miss">Miss</SelectItem>
                        <SelectItem value="Dr">Dr</SelectItem>
                        <SelectItem value="Prof">Prof</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="nationality">Nationality</Label>
                    <Input
                      id="nationality"
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      placeholder="e.g., Ghanaian"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input
                      id="dateOfBirth"
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="officeAddress">Office Address</Label>
                  <Textarea
                    id="officeAddress"
                    value={officeAddress}
                    onChange={(e) => setOfficeAddress(e.target.value)}
                    placeholder="Enter your office address"
                    rows={3}
                  />
                </div>

                <div>
                  <Label htmlFor="residentialAddress">Residential Address</Label>
                  <Textarea
                    id="residentialAddress"
                    value={residentialAddress}
                    onChange={(e) => setResidentialAddress(e.target.value)}
                    placeholder="Enter your residential address"
                    rows={3}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="emailAddress">Email Address</Label>
                    <Input
                      id="emailAddress"
                      type="email"
                      value={emailAddress}
                      onChange={(e) => setEmailAddress(e.target.value)}
                      placeholder="your.email@example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="telephoneCell">Cell Phone</Label>
                    <Input
                      id="telephoneCell"
                      value={telephoneCell}
                      onChange={(e) => setTelephoneCell(e.target.value)}
                      placeholder="0554210052"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="telephoneOffice">Office Phone</Label>
                    <Input
                      id="telephoneOffice"
                      value={telephoneOffice}
                      onChange={(e) => setTelephoneOffice(e.target.value)}
                      placeholder="0302123456"
                    />
                  </div>
                  <div>
                    <Label htmlFor="presentSchoolInstitution">Present School/Institution</Label>
                    <Input
                      id="presentSchoolInstitution"
                      value={presentSchoolInstitution}
                      onChange={(e) => setPresentSchoolInstitution(e.target.value)}
                      placeholder="Name of your current institution"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="presentRankPosition">Present Rank/Position</Label>
                  <Input
                    id="presentRankPosition"
                    value={presentRankPosition}
                    onChange={(e) => setPresentRankPosition(e.target.value)}
                    placeholder="e.g., Senior Lecturer, Principal, etc."
                  />
                </div>
              </div>
            )}

            {/* Step 2: Academic Qualifications */}
            {currentStep === 2 && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                  <h3 className="text-base sm:text-lg font-semibold">Academic Qualifications</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setQualifications([
                        ...qualifications,
                        {
                          university_college: "",
                          degree_diploma: "",
                          class_of_degree: null,
                          major_subjects: null,
                          date_of_award: null,
                          order_index: qualifications.length,
                        },
                      ])
                    }
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Qualification
                  </Button>
                </div>

                {qualifications.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    <GraduationCap className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                    <p className="text-sm sm:text-base px-4">
                      No qualifications added yet. Click "Add Qualification" to get started.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    {qualifications.map((qual, index) => (
                      <Card key={index} className="border-l-4 border-l-primary">
                        <CardHeader className="pb-3 sm:pb-4">
                          <div className="flex justify-between items-center gap-2">
                            <CardTitle className="text-sm sm:text-base">Qualification {index + 1}</CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setQualifications(qualifications.filter((_, i) => i !== index))}
                              className="h-8 w-8 p-0 shrink-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-0">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>University/College *</Label>
                              <Input
                                value={qual.university_college}
                                onChange={(e) => {
                                  const updated = [...qualifications];
                                  updated[index].university_college = e.target.value;
                                  setQualifications(updated);
                                }}
                                placeholder="Name of university/college"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Degree/Diploma *</Label>
                              <Input
                                value={qual.degree_diploma}
                                onChange={(e) => {
                                  const updated = [...qualifications];
                                  updated[index].degree_diploma = e.target.value;
                                  setQualifications(updated);
                                }}
                                placeholder="e.g., BSc, MSc, PhD"
                                required
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Class of Degree</Label>
                              <Input
                                value={qual.class_of_degree || ""}
                                onChange={(e) => {
                                  const updated = [...qualifications];
                                  updated[index].class_of_degree = e.target.value || null;
                                  setQualifications(updated);
                                }}
                                placeholder="e.g., First Class, Second Class Upper"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Date of Award</Label>
                              <Input
                                type="date"
                                value={qual.date_of_award || ""}
                                onChange={(e) => {
                                  const updated = [...qualifications];
                                  updated[index].date_of_award = e.target.value || null;
                                  setQualifications(updated);
                                }}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Major Subjects</Label>
                            <Textarea
                              value={qual.major_subjects || ""}
                              onChange={(e) => {
                                const updated = [...qualifications];
                                updated[index].major_subjects = e.target.value || null;
                                setQualifications(updated);
                              }}
                              placeholder="List your major subjects"
                              rows={2}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Teaching Experience */}
            {currentStep === 3 && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                  <h3 className="text-base sm:text-lg font-semibold">Teaching Experience</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setTeachingExperiences([
                        ...teachingExperiences,
                        {
                          institution_name: "",
                          date_from: null,
                          date_to: null,
                          subject: null,
                          level: null,
                          order_index: teachingExperiences.length,
                        },
                      ])
                    }
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Experience
                  </Button>
                </div>

                {teachingExperiences.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    <BookOpen className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                    <p className="text-sm sm:text-base px-4">No teaching experience added yet. This section is optional.</p>
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    {teachingExperiences.map((exp, index) => (
                      <Card key={index} className="border-l-4 border-l-primary">
                        <CardHeader className="pb-3 sm:pb-4">
                          <div className="flex justify-between items-center gap-2">
                            <CardTitle className="text-sm sm:text-base">Experience {index + 1}</CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setTeachingExperiences(teachingExperiences.filter((_, i) => i !== index))}
                              className="h-8 w-8 p-0 shrink-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-0">
                          <div className="space-y-2">
                            <Label>Institution Name *</Label>
                            <Input
                              value={exp.institution_name}
                              onChange={(e) => {
                                const updated = [...teachingExperiences];
                                updated[index].institution_name = e.target.value;
                                setTeachingExperiences(updated);
                              }}
                              placeholder="Name of institution"
                              required
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Date From</Label>
                              <Input
                                type="date"
                                value={exp.date_from || ""}
                                onChange={(e) => {
                                  const updated = [...teachingExperiences];
                                  updated[index].date_from = e.target.value || null;
                                  setTeachingExperiences(updated);
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Date To</Label>
                              <Input
                                type="date"
                                value={exp.date_to || ""}
                                onChange={(e) => {
                                  const updated = [...teachingExperiences];
                                  updated[index].date_to = e.target.value || null;
                                  setTeachingExperiences(updated);
                                }}
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Subject</Label>
                              <Input
                                value={exp.subject || ""}
                                onChange={(e) => {
                                  const updated = [...teachingExperiences];
                                  updated[index].subject = e.target.value || null;
                                  setTeachingExperiences(updated);
                                }}
                                placeholder="Subject taught"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Level</Label>
                              <Input
                                value={exp.level || ""}
                                onChange={(e) => {
                                  const updated = [...teachingExperiences];
                                  updated[index].level = e.target.value || null;
                                  setTeachingExperiences(updated);
                                }}
                                placeholder="e.g., SHS, Tertiary"
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 4: Work Experience */}
            {currentStep === 4 && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                  <h3 className="text-base sm:text-lg font-semibold">Work Experience</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setWorkExperiences([
                        ...workExperiences,
                        {
                          occupation: "",
                          employer_name: "",
                          date_from: null,
                          date_to: null,
                          position_held: null,
                          order_index: workExperiences.length,
                        },
                      ])
                    }
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Experience
                  </Button>
                </div>

                {workExperiences.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Briefcase className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                    <p className="text-sm sm:text-base px-4">No work experience added yet. This section is optional.</p>
                  </div>
                ) : (
                  <div className="space-y-3 sm:space-y-4">
                    {workExperiences.map((exp, index) => (
                      <Card key={index} className="border-l-4 border-l-primary">
                        <CardHeader className="pb-3 sm:pb-4">
                          <div className="flex justify-between items-center gap-2">
                            <CardTitle className="text-sm sm:text-base">Experience {index + 1}</CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setWorkExperiences(workExperiences.filter((_, i) => i !== index))}
                              className="h-8 w-8 p-0 shrink-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-0">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Occupation *</Label>
                              <Input
                                value={exp.occupation}
                                onChange={(e) => {
                                  const updated = [...workExperiences];
                                  updated[index].occupation = e.target.value;
                                  setWorkExperiences(updated);
                                }}
                                placeholder="Your occupation"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Employer Name *</Label>
                              <Input
                                value={exp.employer_name}
                                onChange={(e) => {
                                  const updated = [...workExperiences];
                                  updated[index].employer_name = e.target.value;
                                  setWorkExperiences(updated);
                                }}
                                placeholder="Name of employer"
                                required
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Date From</Label>
                              <Input
                                type="date"
                                value={exp.date_from || ""}
                                onChange={(e) => {
                                  const updated = [...workExperiences];
                                  updated[index].date_from = e.target.value || null;
                                  setWorkExperiences(updated);
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Date To</Label>
                              <Input
                                type="date"
                                value={exp.date_to || ""}
                                onChange={(e) => {
                                  const updated = [...workExperiences];
                                  updated[index].date_to = e.target.value || null;
                                  setWorkExperiences(updated);
                                }}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Position Held</Label>
                            <Input
                              value={exp.position_held || ""}
                              onChange={(e) => {
                                const updated = [...workExperiences];
                                updated[index].position_held = e.target.value || null;
                                setWorkExperiences(updated);
                              }}
                              placeholder="Position held at this organization"
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 5: Examining Experience */}
            {currentStep === 5 && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                  <h3 className="text-base sm:text-lg font-semibold">Examining Experience</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setExaminingExperiences([
                        ...examiningExperiences,
                        {
                          examination_body: "",
                          subject: null,
                          level: null,
                          status: null,
                          date_from: null,
                          date_to: null,
                          order_index: examiningExperiences.length,
                        },
                      ])
                    }
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Experience
                  </Button>
                </div>

                {examiningExperiences.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    <Award className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                    <p className="text-sm sm:text-base px-4">No examining experience added yet. This section is optional.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {examiningExperiences.map((exp, index) => (
                      <Card key={index} className="border-l-4 border-l-primary">
                        <CardHeader className="pb-3 sm:pb-4">
                          <div className="flex justify-between items-center gap-2">
                            <CardTitle className="text-sm sm:text-base">Experience {index + 1}</CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setExaminingExperiences(examiningExperiences.filter((_, i) => i !== index))}
                              className="h-8 w-8 p-0 shrink-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-0">
                          <div className="space-y-2">
                            <Label>Examination Body *</Label>
                            <Input
                              value={exp.examination_body}
                              onChange={(e) => {
                                const updated = [...examiningExperiences];
                                updated[index].examination_body = e.target.value;
                                setExaminingExperiences(updated);
                              }}
                              placeholder="e.g., WAEC, CTVET"
                              required
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Subject</Label>
                              <Input
                                value={exp.subject || ""}
                                onChange={(e) => {
                                  const updated = [...examiningExperiences];
                                  updated[index].subject = e.target.value || null;
                                  setExaminingExperiences(updated);
                                }}
                                placeholder="Subject examined"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Level</Label>
                              <Input
                                value={exp.level || ""}
                                onChange={(e) => {
                                  const updated = [...examiningExperiences];
                                  updated[index].level = e.target.value || null;
                                  setExaminingExperiences(updated);
                                }}
                                placeholder="e.g., Assist. Examiner, Team Leader"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Input
                                value={exp.status || ""}
                                onChange={(e) => {
                                  const updated = [...examiningExperiences];
                                  updated[index].status = e.target.value || null;
                                  setExaminingExperiences(updated);
                                }}
                                placeholder="e.g., Access, O' Level, WASSCE"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Date From</Label>
                              <Input
                                type="date"
                                value={exp.date_from || ""}
                                onChange={(e) => {
                                  const updated = [...examiningExperiences];
                                  updated[index].date_from = e.target.value || null;
                                  setExaminingExperiences(updated);
                                }}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Date To</Label>
                              <Input
                                type="date"
                                value={exp.date_to || ""}
                                onChange={(e) => {
                                  const updated = [...examiningExperiences];
                                  updated[index].date_to = e.target.value || null;
                                  setExaminingExperiences(updated);
                                }}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 6: Training Courses */}
            {currentStep === 6 && (
              <div className="space-y-4 sm:space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
                  <h3 className="text-base sm:text-lg font-semibold">Training Courses</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setTrainingCourses([
                        ...trainingCourses,
                        {
                          organizer: "",
                          course_name: "",
                          place: null,
                          date_from: null,
                          date_to: null,
                          reason_for_participation: null,
                          order_index: trainingCourses.length,
                        },
                      ])
                    }
                    className="w-full sm:w-auto"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Course
                  </Button>
                </div>

                {trainingCourses.length === 0 ? (
                  <div className="text-center py-8 sm:py-12 text-muted-foreground border-2 border-dashed rounded-lg">
                    <BookOpen className="h-10 w-10 sm:h-12 sm:w-12 mx-auto mb-3 sm:mb-4 opacity-50" />
                    <p className="text-sm sm:text-base px-4">No training courses added yet. This section is optional.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {trainingCourses.map((course, index) => (
                      <Card key={index} className="border-l-4 border-l-primary">
                        <CardHeader className="pb-3 sm:pb-4">
                          <div className="flex justify-between items-center gap-2">
                            <CardTitle className="text-sm sm:text-base">Course {index + 1}</CardTitle>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setTrainingCourses(trainingCourses.filter((_, i) => i !== index))}
                              className="h-8 w-8 p-0 shrink-0"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-0">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Organizer *</Label>
                              <Input
                                value={course.organizer}
                                onChange={(e) => {
                                  const updated = [...trainingCourses];
                                  updated[index].organizer = e.target.value;
                                  setTrainingCourses(updated);
                                }}
                                placeholder="Organization that organized the course"
                                required
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Course Name *</Label>
                              <Input
                                value={course.course_name}
                                onChange={(e) => {
                                  const updated = [...trainingCourses];
                                  updated[index].course_name = e.target.value;
                                  setTrainingCourses(updated);
                                }}
                                placeholder="Name of the course"
                                required
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Place</Label>
                              <Input
                                value={course.place || ""}
                                onChange={(e) => {
                                  const updated = [...trainingCourses];
                                  updated[index].place = e.target.value || null;
                                  setTrainingCourses(updated);
                                }}
                                placeholder="Location of the course"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-2">
                                <Label>Date From</Label>
                                <Input
                                  type="date"
                                  value={course.date_from || ""}
                                  onChange={(e) => {
                                    const updated = [...trainingCourses];
                                    updated[index].date_from = e.target.value || null;
                                    setTrainingCourses(updated);
                                  }}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Date To</Label>
                                <Input
                                  type="date"
                                  value={course.date_to || ""}
                                  onChange={(e) => {
                                    const updated = [...trainingCourses];
                                    updated[index].date_to = e.target.value || null;
                                    setTrainingCourses(updated);
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Reason for Participation</Label>
                            <Textarea
                              value={course.reason_for_participation || ""}
                              onChange={(e) => {
                                const updated = [...trainingCourses];
                                updated[index].reason_for_participation = e.target.value || null;
                                setTrainingCourses(updated);
                              }}
                              placeholder="Why did you participate in this course?"
                              rows={3}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 7: Subject Preferences & Additional Info */}
            {currentStep === 7 && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-4">Subject Preferences</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="subjectArea">Subject Area</Label>
                      <Input
                        id="subjectArea"
                        value={subjectArea}
                        onChange={(e) => setSubjectArea(e.target.value)}
                        placeholder="Enter your preferred subject area"
                      />
                    </div>

                    <div>
                      <Label>Subject Preference Types</Label>
                      <div className="space-y-2 mt-2">
                        {[
                          "ELECTIVE",
                          "CORE",
                          "TECHNICAL_DRAWING_BUILDING",
                          "TECHNICAL_DRAWING_MECHANICAL",
                          "PRACTICAL_COMPONENT",
                          "ACCESS_COURSE",
                        ].map((type) => {
                          const exists = subjectPreferences.some((sp) => sp.preference_type === type);
                          return (
                            <div key={type} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                id={type}
                                checked={exists}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSubjectPreferences([
                                      ...subjectPreferences,
                                      { preference_type: type as any, subject_area: null },
                                    ]);
                                  } else {
                                    setSubjectPreferences(
                                      subjectPreferences.filter((sp) => sp.preference_type !== type)
                                    );
                                  }
                                }}
                                className="rounded"
                              />
                              <Label htmlFor={type} className="font-normal cursor-pointer">
                                {type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                              </Label>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-4">Additional Information</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="additionalInformation">Additional Information</Label>
                      <Textarea
                        id="additionalInformation"
                        value={additionalInformation}
                        onChange={(e) => setAdditionalInformation(e.target.value)}
                        placeholder="Any additional information you'd like to provide"
                        rows={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="ceasedExaminingExplanation">
                        If you have ceased examining, please explain
                      </Label>
                      <Textarea
                        id="ceasedExaminingExplanation"
                        value={ceasedExaminingExplanation}
                        onChange={(e) => setCeasedExaminingExplanation(e.target.value)}
                        placeholder="Explain if you have ceased examining"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 8: Documents */}
            {currentStep === 8 && (
              <div className="space-y-6 sm:space-y-8">
                {/* Photograph */}
                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Photograph</h3>
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <Label htmlFor="photograph" className="text-xs sm:text-sm">Upload Photograph</Label>
                      <Input
                        id="photograph"
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) setPhotographFile(file);
                        }}
                        className="cursor-pointer text-xs sm:text-sm mt-1.5"
                      />
                    </div>
                    {photographFile && (
                      <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="text-xs sm:text-sm truncate flex-1">{photographFile.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (applicationId && photographFile) {
                              handleDocumentUpload(photographFile, "PHOTOGRAPH");
                            }
                          }}
                          disabled={uploadingDocument === "PHOTOGRAPH" || !applicationId}
                          className="h-8 w-8 p-0 shrink-0"
                        >
                          {uploadingDocument === "PHOTOGRAPH" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    )}
                    {documents
                      .filter((d) => d.document_type === "PHOTOGRAPH")
                      .map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="text-xs sm:text-sm truncate">{doc.file_name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="h-8 w-8 p-0 shrink-0"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Certificates */}
                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Certificates</h3>
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <Label htmlFor="certificates" className="text-xs sm:text-sm">Upload Certificates</Label>
                      <Input
                        id="certificates"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setCertificateFiles([...certificateFiles, ...files]);
                        }}
                        className="cursor-pointer text-xs sm:text-sm mt-1.5"
                      />
                    </div>
                    {certificateFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="text-xs sm:text-sm truncate flex-1">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (applicationId) {
                              handleDocumentUpload(file, "CERTIFICATE");
                              setCertificateFiles(certificateFiles.filter((_, i) => i !== index));
                            }
                          }}
                          disabled={uploadingDocument === "CERTIFICATE" || !applicationId}
                          className="h-8 w-8 p-0 shrink-0"
                        >
                          {uploadingDocument === "CERTIFICATE" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setCertificateFiles(certificateFiles.filter((_, i) => i !== index))}
                          className="h-8 w-8 p-0 shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {documents
                      .filter((d) => d.document_type === "CERTIFICATE")
                      .map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="text-xs sm:text-sm truncate">{doc.file_name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="h-8 w-8 p-0 shrink-0"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Transcripts */}
                <div>
                  <h3 className="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Transcripts</h3>
                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <Label htmlFor="transcripts" className="text-xs sm:text-sm">Upload Transcripts</Label>
                      <Input
                        id="transcripts"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png"
                        multiple
                        onChange={(e) => {
                          const files = Array.from(e.target.files || []);
                          setTranscriptFiles([...transcriptFiles, ...files]);
                        }}
                        className="cursor-pointer text-xs sm:text-sm mt-1.5"
                      />
                    </div>
                    {transcriptFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                        <FileText className="h-4 w-4 shrink-0" />
                        <span className="text-xs sm:text-sm truncate flex-1">{file.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (applicationId) {
                              handleDocumentUpload(file, "TRANSCRIPT");
                              setTranscriptFiles(transcriptFiles.filter((_, i) => i !== index));
                            }
                          }}
                          disabled={uploadingDocument === "TRANSCRIPT" || !applicationId}
                          className="h-8 w-8 p-0 shrink-0"
                        >
                          {uploadingDocument === "TRANSCRIPT" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setTranscriptFiles(transcriptFiles.filter((_, i) => i !== index))}
                          className="h-8 w-8 p-0 shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    {documents
                      .filter((d) => d.document_type === "TRANSCRIPT")
                      .map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <FileText className="h-4 w-4 shrink-0" />
                            <span className="text-xs sm:text-sm truncate">{doc.file_name}</span>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                            className="h-8 w-8 p-0 shrink-0"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 9: Review & Submit */}
            {currentStep === 9 && (
              <div className="space-y-6">
                <div className="bg-muted p-4 rounded-lg">
                  <h3 className="font-semibold mb-2">Review Your Application</h3>
                  <p className="text-sm text-muted-foreground">
                    Please review all the information you've provided. Once you submit, you'll be redirected to make payment.
                  </p>
                </div>

                {/* Personal Particulars Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Personal Particulars</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div>
                      <span className="text-xs sm:text-sm text-muted-foreground">Full Name:</span>
                      <p className="font-medium text-sm sm:text-base mt-1">{fullName || "Not provided"}</p>
                    </div>
                    <div>
                      <span className="text-xs sm:text-sm text-muted-foreground">Email:</span>
                      <p className="font-medium text-sm sm:text-base mt-1 break-all">{emailAddress || "Not provided"}</p>
                    </div>
                    <div>
                      <span className="text-xs sm:text-sm text-muted-foreground">Phone:</span>
                      <p className="font-medium text-sm sm:text-base mt-1">{telephoneCell || telephoneOffice || "Not provided"}</p>
                    </div>
                    <div>
                      <span className="text-xs sm:text-sm text-muted-foreground">Nationality:</span>
                      <p className="font-medium text-sm sm:text-base mt-1">{nationality || "Not provided"}</p>
                    </div>
                  </div>
                  </CardContent>
                </Card>

                {/* Qualifications Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      Academic Qualifications ({qualifications.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {qualifications.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {qualifications.map((q, idx) => (
                          <li key={idx}>
                            {q.degree_diploma} - {q.university_college}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No qualifications added</p>
                    )}
                  </CardContent>
                </Card>

                {/* Documents Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Documents ({documents.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {documents.length > 0 ? (
                      <ul className="space-y-2 text-sm">
                        {documents.map((doc) => (
                          <li key={doc.id} className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            {doc.file_name} ({doc.document_type})
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No documents uploaded</p>
                    )}
                  </CardContent>
                </Card>

                <AlertDialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Submit Application?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Once you submit, you'll be redirected to make payment. Make sure all information is correct.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleSubmit} disabled={submitting}>
                        {submitting ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Submit & Pay"
                        )}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>

                <Button
                  onClick={() => setShowSubmitDialog(true)}
                  className="w-full"
                  size="lg"
                  disabled={!applicationId || submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      <span className="hidden sm:inline">Submitting...</span>
                      <span className="sm:hidden">Submitting...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      <span className="hidden sm:inline">Submit Application & Proceed to Payment</span>
                      <span className="sm:hidden">Submit & Pay</span>
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex flex-col-reverse sm:flex-row justify-between gap-3 pt-4 sm:pt-6 border-t">
              <div className="flex gap-2 w-full sm:w-auto">
                <Button
                  variant="outline"
                  onClick={handlePrevious}
                  disabled={currentStep === 1 || loading || submitting || isLoadingDraft}
                  className="flex-1 sm:flex-initial"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Previous
                </Button>
                {applicationId && (
                  <Button
                    variant="ghost"
                    onClick={handleManualSave}
                    disabled={saving || isLoadingDraft}
                    className="sm:hidden"
                    size="sm"
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
              {currentStep < 9 ? (
                <Button
                  onClick={handleNext}
                  disabled={loading || submitting || isLoadingDraft}
                  className="w-full sm:w-auto"
                >
                  Next
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
