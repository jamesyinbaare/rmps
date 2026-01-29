"use client";

import { useEffect, useState, useRef } from "react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, ChevronRight, ChevronLeft, Check, FileText } from "lucide-react";
import {
  DEGREE_TYPES,
  GHANA_REGIONS,
  TEACHING_LEVELS,
  type ExaminerApplicationCreate,
  type ExaminerApplicationResponse,
  type ExaminerApplicationUpdate,
  type GhanaRegion,
  type Qualification,
  type TeachingExperience,
  type WorkExperience,
  type ExaminingExperience,
  type TrainingCourse,
} from "@/types";
import { format } from "date-fns";
import { getApplicationPrice, initializeApplicationPayment, getApplication, getSubjectTypes, getSubjects } from "@/lib/api";
import { toast } from "sonner";
import { DocumentUpload } from "@/components/applications/DocumentUpload";
import { SearchableSubjectSelect } from "@/components/ui/searchable-subject-select";
import type {
  ExaminerApplicationDocumentResponse,
  ExaminerDocumentType,
  Subject,
  SubjectTypeOption,
} from "@/types";

const TITLE_OPTIONS = [
  { value: "__none__", label: "Select title" },
  { value: "Mr.", label: "Mr." },
  { value: "Mrs.", label: "Mrs." },
  { value: "Ms.", label: "Ms." },
  { value: "Miss", label: "Miss" },
  { value: "Rev.", label: "Rev." },
  { value: "Dr.", label: "Dr." },
  { value: "Prof.", label: "Prof." },
] as const;

const EXAMINING_STATUS_OPTIONS = [
  { value: "__none__", label: "Select status" },
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
] as const;

// Step 1: Personal Particulars only (validates current step without touching step 2+ fields)
const step1Schema = z
  .object({
    full_name: z.string().min(1, "Full name is required"),
    title: z.string().refine((v) => v && v !== "__none__", "Title is required"),
    region: z.string().min(1, "Region is required"),
    nationality: z.string().optional().nullable(),
    date_of_birth: z.string().optional().nullable(),
    office_address: z.string().optional().nullable(),
    residential_address: z.string().optional().nullable(),
    email_address: z.string().email("Invalid email address").min(1, "Email address is required"),
    telephone_office: z.string().optional().nullable(),
    telephone_cell: z.string().optional().nullable(),
    present_school_institution: z.string().optional().nullable(),
    present_rank_position: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      const o = (data.telephone_office ?? "").toString().trim();
      const c = (data.telephone_cell ?? "").toString().trim();
      return !!o || !!c;
    },
    { message: "At least one telephone number is required", path: ["telephone_cell"] }
  );

const step2Schema = z.object({
  subject_type: z.string().min(1, "Subject type is required"),
  subject_id: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .refine((v) => v != null && v !== "", "Please select a subject"),
});

const step8Schema = z.object({
  additional_information: z.string().optional().nullable(),
  ceased_examining_explanation: z.string().optional().nullable(),
});

// Full schema for form state and submit
const multiStepSchema = z.object({
  // Step 1: Personal Particulars
  full_name: z.string().min(1, "Full name is required"),
  title: z.string().refine((v) => v && v !== "__none__", "Title is required"),
  region: z.string().min(1, "Region is required"),
  nationality: z.string().optional().nullable(),
  date_of_birth: z.string().optional().nullable(),
  office_address: z.string().optional().nullable(),
  residential_address: z.string().optional().nullable(),
  email_address: z.string().email("Invalid email address").min(1, "Email address is required"),
  telephone_office: z.string().optional().nullable(),
  telephone_cell: z.string().optional().nullable(),
  present_school_institution: z.string().optional().nullable(),
  present_rank_position: z.string().optional().nullable(),

  // Step 2: Subject (type + subject)
  subject_type: z.string().min(1, "Subject type is required"),
  subject_id: z
    .union([z.string().uuid(), z.literal(""), z.null()])
    .refine((v) => v != null && v !== "", "Please select a subject"),

  // Step 3: Qualifications
  qualifications: z.array(
    z.object({
      university_college: z.string().min(1, "University/College is required"),
      degree_type: z.enum(DEGREE_TYPES),
      programme: z.string().optional().nullable(),
      class_of_degree: z.string().optional().nullable(),
      major_subjects: z.string().optional().nullable(),
      date_of_award: z.string().optional().nullable(),
    })
  ).optional(),

  // Step 4: Teaching Experiences
  teaching_experiences: z.array(
    z.object({
      institution_name: z.string().min(1, "Institution name is required"),
      date_from: z.string().optional().nullable(),
      date_to: z.string().optional().nullable(),
      subject: z.string().optional().nullable(),
      level: z
        .union([z.enum(TEACHING_LEVELS), z.literal(""), z.null()])
        .optional()
        .nullable(),
    })
  ).optional(),

  // Step 5: Work Experiences
  work_experiences: z.array(
    z.object({
      occupation: z.string().min(1, "Occupation is required"),
      employer_name: z.string().min(1, "Employer name is required"),
      date_from: z.string().optional().nullable(),
      date_to: z.string().optional().nullable(),
      position_held: z.string().optional().nullable(),
    })
  ).optional(),

  // Step 6: Examining Experiences
  examining_experiences: z.array(
    z.object({
      examination_body: z.string().min(1, "Examination body is required"),
      subject: z.string().optional().nullable(),
      level: z.string().optional().nullable(),
      status: z.string().optional().nullable(),
      date_from: z.string().optional().nullable(),
      date_to: z.string().optional().nullable(),
    })
  ).optional(),

  // Step 7: Training Courses
  training_courses: z.array(
    z.object({
      organizer: z.string().min(1, "Organizer is required"),
      course_name: z.string().min(1, "Course name is required"),
      place: z.string().optional().nullable(),
      date_from: z.string().optional().nullable(),
      date_to: z.string().optional().nullable(),
      reason_for_participation: z.string().optional().nullable(),
    })
  ).optional(),

  // Step 8: Additional Information
  additional_information: z.string().optional().nullable(),
  ceased_examining_explanation: z.string().optional().nullable(),
}).refine(
  (data) => data.telephone_office || data.telephone_cell,
  {
    message: "At least one telephone number is required",
    path: ["telephone_cell"],
  }
);

type MultiStepFormData = z.infer<typeof multiStepSchema>;

interface MultiStepApplicationFormProps {
  /** When provided, form runs in draft mode: save on step change, payment, review, submit. */
  draftId: string | null;
  /** Initial data when resuming a draft. */
  initialData?: ExaminerApplicationResponse | null;
  /** Resume at this step (e.g. last_completed_step). */
  initialStep?: number;
  /** Create draft on first Next (step 1). Returns new application id. */
  onCreateDraft: (data: ExaminerApplicationCreate) => Promise<string>;
  /** Save draft (update) when changing steps. */
  onSaveDraft: (data: ExaminerApplicationUpdate, step: number) => Promise<void>;
  /** Submit application (payment must be complete). */
  onSubmitApplication: () => Promise<void>;
  /** Save draft and exit (e.g. logout or redirect). */
  onSaveAndExit: () => void;
  loading?: boolean;
  saving?: boolean;
}

const STEPS = [
  { id: 1, title: "Personal Particulars", description: "Basic information" },
  { id: 2, title: "Subject Area", description: "Subject preferences" },
  { id: 3, title: "Qualifications", description: "Academic qualifications" },
  { id: 4, title: "Teaching Experience", description: "Teaching history" },
  { id: 5, title: "Work Experience", description: "Work history" },
  { id: 6, title: "Examining Experience", description: "Examining history" },
  { id: 7, title: "Training Courses", description: "Training and courses" },
  { id: 8, title: "Additional Information", description: "Other details" },
  { id: 9, title: "Documents", description: "Upload documents" },
  { id: 10, title: "Payment", description: "Application fee" },
  { id: 11, title: "Review", description: "Review and submit" },
];

export function MultiStepApplicationForm({
  draftId,
  initialData,
  initialStep = 1,
  onCreateDraft,
  onSaveDraft,
  onSubmitApplication,
  onSaveAndExit,
  loading = false,
  saving = false,
}: MultiStepApplicationFormProps) {
  const [currentStep, setCurrentStep] = useState(initialStep);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [localDraftId, setLocalDraftId] = useState<string | null>(draftId);
  const [priceData, setPriceData] = useState<{
    application_fee: number;
    outstanding_amount: number;
    payment_required: boolean;
    has_pricing: boolean;
  } | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [documents, setDocuments] = useState<ExaminerApplicationDocumentResponse[]>([]);
  const [subjectTypeOptions, setSubjectTypeOptions] = useState<SubjectTypeOption[]>([]);
  const [subjectsByType, setSubjectsByType] = useState<Subject[]>([]);
  const activeDraftId = localDraftId ?? draftId;
  const lastInitialStepRef = useRef<number | null>(null);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
    getValues,
    reset,
    setError,
    clearErrors,
  } = useForm<MultiStepFormData>({
    resolver: zodResolver(multiStepSchema),
    defaultValues: {
      full_name: "",
      title: "__none__",
      region: "",
      nationality: null,
      date_of_birth: null,
      office_address: null,
      residential_address: null,
      email_address: "",
      telephone_office: null,
      telephone_cell: null,
      present_school_institution: null,
      present_rank_position: null,
      subject_type: "",
      subject_id: null,
      qualifications: [],
      teaching_experiences: [],
      work_experiences: [],
      examining_experiences: [],
      training_courses: [],
      additional_information: null,
      ceased_examining_explanation: null,
    },
    mode: "onChange",
  });

  const {
    fields: qualificationFields,
    append: appendQualification,
    remove: removeQualification,
  } = useFieldArray({
    control,
    name: "qualifications",
  });

  const {
    fields: teachingFields,
    append: appendTeaching,
    remove: removeTeaching,
  } = useFieldArray({
    control,
    name: "teaching_experiences",
  });

  const {
    fields: workFields,
    append: appendWork,
    remove: removeWork,
  } = useFieldArray({
    control,
    name: "work_experiences",
  });

  const {
    fields: examiningFields,
    append: appendExamining,
    remove: removeExamining,
  } = useFieldArray({
    control,
    name: "examining_experiences",
  });

  const {
    fields: trainingFields,
    append: appendTraining,
    remove: removeTraining,
  } = useFieldArray({
    control,
    name: "training_courses",
  });

  useEffect(() => {
    setLocalDraftId(draftId);
  }, [draftId]);

  // Load subject type options for step 2
  useEffect(() => {
    getSubjectTypes()
      .then(setSubjectTypeOptions)
      .catch(() => setSubjectTypeOptions([]));
  }, []);

  // Load subjects when subject type changes (step 2)
  const watchedSubjectType = watch("subject_type");
  useEffect(() => {
    if (!watchedSubjectType) {
      setSubjectsByType([]);
      return;
    }
    getSubjects(watchedSubjectType as import("@/types").SubjectType)
      .then(setSubjectsByType)
      .catch(() => setSubjectsByType([]));
  }, [watchedSubjectType]);

  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (initialData) {
      const currentFormData = getValues();
      // Only reset nested arrays if form hasn't been initialized yet
      // This prevents losing user-entered data when initialData changes after save
      const shouldResetNested = !hasInitializedRef.current;
      // Load nested data from backend response if available
      const loadNestedData = shouldResetNested && initialData.qualifications;
      // Clean up additional_information by removing old structured data JSON
      let cleanedAdditionalInfo = initialData.additional_information || null;
      if (cleanedAdditionalInfo) {
        // Remove [Structured Data: ...] blocks
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\[Structured Data:[\s\S]*?\]/g, "");

        // Remove JSON objects that contain nested arrays (legacy format) - handle various patterns
        // Pattern 1: Full JSON objects with empty arrays
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"qualifications"\[[^\]]*\][^}]*\}/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"teaching_experiences"\[[^\]]*\][^}]*\}/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"work_experiences"\[[^\]]*\][^}]*\}/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"examining_experiences"\[[^\]]*\][^}]*\}/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"training_courses"\[[^\]]*\][^}]*\}/g, "");

        // Pattern 2: JSON objects with empty arrays (standard format)
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"teaching_experiences"\s*:\s*\[\][^}]*\}/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"work_experiences"\s*:\s*\[\][^}]*\}/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"examining_experiences"\s*:\s*\[\][^}]*\}/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"training_courses"\s*:\s*\[\][^}]*\}/g, "");

        // Pattern 3: Standalone JSON fragments starting with comma (like ,"teaching_experiences":[],...)
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"teaching_experiences"\s*:\s*\[\]/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"work_experiences"\s*:\s*\[\]/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"examining_experiences"\s*:\s*\[\]/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"training_courses"\s*:\s*\[\]/g, "");

        // Pattern 4: Remove trailing closing braces and commas that might be left
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*\}/g, "}");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/^\s*,\s*/g, "");
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*$/g, "");

        // Pattern 5: Remove any remaining JSON objects that only contain empty arrays (multiline)
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"teaching_experiences"\s*:\s*\[\]\s*,\s*"work_experiences"\s*:\s*\[\]\s*,\s*"examining_experiences"\s*:\s*\[\]\s*,\s*"training_courses"\s*:\s*\[\][^}]*\}/g, "");

        // Pattern 6: Remove any JSON-like structures with whitespace/newlines
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{\s*"teaching_experiences"\s*:\s*\[\]\s*,\s*"work_experiences"\s*:\s*\[\]\s*,\s*"examining_experiences"\s*:\s*\[\]\s*,\s*"training_courses"\s*:\s*\[\]\s*\}/g, "");

        // Pattern 7: Remove multiple occurrences of the same pattern (handle repeated artifacts)
        let prevLength = 0;
        while (cleanedAdditionalInfo && cleanedAdditionalInfo.length !== prevLength) {
          prevLength = cleanedAdditionalInfo.length;
          cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"teaching_experiences"\s*:\s*\[\]\s*,\s*"work_experiences"\s*:\s*\[\]\s*,\s*"examining_experiences"\s*:\s*\[\]\s*,\s*"training_courses"\s*:\s*\[\]/g, "");
        }

        cleanedAdditionalInfo = cleanedAdditionalInfo.trim();
        if (!cleanedAdditionalInfo || cleanedAdditionalInfo.length === 0) {
          cleanedAdditionalInfo = null;
        }
      }
      reset({
        full_name: initialData.full_name ?? "",
        title: initialData.title ?? "__none__",
        region: initialData.region ?? "",
        nationality: initialData.nationality ?? null,
        date_of_birth: initialData.date_of_birth ?? null,
        office_address: initialData.office_address ?? null,
        residential_address: initialData.residential_address ?? null,
        email_address: initialData.email_address ?? "",
        telephone_office: initialData.telephone_office ?? null,
        telephone_cell: initialData.telephone_cell ?? null,
        present_school_institution: initialData.present_school_institution ?? null,
        present_rank_position: initialData.present_rank_position ?? null,
        subject_type: initialData.subject?.type ?? initialData.subject_area ?? "",
        subject_id: initialData.subject_id ?? null,
        additional_information: cleanedAdditionalInfo,
        ceased_examining_explanation: initialData.ceased_examining_explanation ?? null,
        // Load from backend response if available, otherwise preserve existing or use empty
        qualifications: loadNestedData
          ? (initialData.qualifications || []).map((q) => ({
              university_college: q.university_college,
              degree_type: q.degree_type,
              programme: q.programme ?? null,
              class_of_degree: q.class_of_degree ?? null,
              major_subjects: q.major_subjects ?? null,
              date_of_award: q.date_of_award ?? null,
            }))
          : shouldResetNested
          ? []
          : currentFormData.qualifications || [],
        teaching_experiences: loadNestedData
          ? (initialData.teaching_experiences || []).map((t) => ({
              institution_name: t.institution_name,
              date_from: t.date_from ?? null,
              date_to: t.date_to ?? null,
              subject: t.subject ?? null,
              level: t.level ?? null,
            }))
          : shouldResetNested
          ? []
          : currentFormData.teaching_experiences || [],
        work_experiences: loadNestedData
          ? (initialData.work_experiences || []).map((w) => ({
              occupation: w.occupation,
              employer_name: w.employer_name,
              date_from: w.date_from ?? null,
              date_to: w.date_to ?? null,
              position_held: w.position_held ?? null,
            }))
          : shouldResetNested
          ? []
          : currentFormData.work_experiences || [],
        examining_experiences: loadNestedData
          ? (initialData.examining_experiences || []).map((e) => ({
              examination_body: e.examination_body,
              subject: e.subject ?? null,
              level: e.level ?? null,
              status: e.status ?? null,
              date_from: e.date_from ?? null,
              date_to: e.date_to ?? null,
            }))
          : shouldResetNested
          ? []
          : currentFormData.examining_experiences || [],
        training_courses: loadNestedData
          ? (initialData.training_courses || []).map((t) => ({
              organizer: t.organizer,
              course_name: t.course_name,
              place: t.place ?? null,
              date_from: t.date_from ?? null,
              date_to: t.date_to ?? null,
              reason_for_participation: t.reason_for_participation ?? null,
            }))
          : shouldResetNested
          ? []
          : currentFormData.training_courses || [],
      });
      hasInitializedRef.current = true;
      // Only reset step if initialStep actually changed (not just initialData)
      // This prevents resetting when draft is updated after save
      const targetStep = Math.min(Math.max(1, initialStep), STEPS.length);
      if (lastInitialStepRef.current === null || lastInitialStepRef.current !== initialStep) {
        setCurrentStep(targetStep);
        lastInitialStepRef.current = initialStep;
      }
    }
  }, [initialData, initialStep, reset, getValues]);

  // Load documents when application is loaded
  useEffect(() => {
    if (initialData && initialData.id) {
      // Documents should be included in the response
      setDocuments(initialData.documents || []);
    }
  }, [initialData]);

  useEffect(() => {
    if (currentStep === 10 && activeDraftId) {
      getApplicationPrice(activeDraftId)
        .then((p) =>
          setPriceData({
            application_fee: p.application_fee,
            outstanding_amount: p.outstanding_amount,
            payment_required: p.payment_required,
            has_pricing: p.has_pricing,
          })
        )
        .catch(() => setPriceData(null));
    } else {
      setPriceData(null);
    }
  }, [currentStep, activeDraftId]);

  const buildCreatePayload = (): ExaminerApplicationCreate => {
    const d = getValues();
    const title = d.title === "__none__" ? undefined : d.title;
    if (!title) throw new Error("Title is required");
    if (!d.region) throw new Error("Region is required");
    return {
      full_name: d.full_name,
      title,
      region: d.region as GhanaRegion,
      nationality: d.nationality,
      date_of_birth: d.date_of_birth || null,
      office_address: d.office_address || null,
      residential_address: d.residential_address || null,
      email_address: d.email_address,
      telephone_office: d.telephone_office || null,
      telephone_cell: d.telephone_cell || null,
      present_school_institution: d.present_school_institution || null,
      present_rank_position: d.present_rank_position || null,
      subject_area: d.subject_type || null,
      subject_id: d.subject_id || null,
      additional_information: d.additional_information || null,
      ceased_examining_explanation: d.ceased_examining_explanation || null,
    };
  };

  const buildUpdatePayload = (step: number): ExaminerApplicationUpdate => {
    const d = getValues();
    const qualifications = (d.qualifications || []).map((q) => ({
      university_college: q.university_college,
      degree_type: q.degree_type,
      programme: q.programme || null,
      class_of_degree: q.class_of_degree || null,
      major_subjects: q.major_subjects || null,
      date_of_award: q.date_of_award || null,
    }));
    const teaching_experiences = (d.teaching_experiences || []).map((t) => ({
      institution_name: t.institution_name,
      date_from: t.date_from || null,
      date_to: t.date_to || null,
      subject: t.subject || null,
      level: t.level || null,
    }));
    const work_experiences = (d.work_experiences || []).map((w) => ({
      occupation: w.occupation,
      employer_name: w.employer_name,
      date_from: w.date_from || null,
      date_to: w.date_to || null,
      position_held: w.position_held || null,
    }));
    const examining_experiences = (d.examining_experiences || []).map((e) => ({
      examination_body: e.examination_body,
      subject: e.subject || null,
      level: e.level || null,
      status: e.status || null,
      date_from: e.date_from || null,
      date_to: e.date_to || null,
    }));
    const training_courses = (d.training_courses || []).map((t) => ({
      organizer: t.organizer,
      course_name: t.course_name,
      place: t.place || null,
      date_from: t.date_from || null,
      date_to: t.date_to || null,
      reason_for_participation: t.reason_for_participation || null,
    }));
    // Clean up additional_information by removing old structured data JSON
    // The nested arrays are now sent directly, so we don't need JSON in additional_information
    let cleanedAdditionalInfo = d.additional_information || null;
    if (cleanedAdditionalInfo) {
      // Remove [Structured Data: ...] blocks
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\[Structured Data:[\s\S]*?\]/g, "");

      // Remove JSON objects that contain nested arrays (legacy format) - handle various patterns
      // Pattern 1: Full JSON objects with empty arrays
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"qualifications"\[[^\]]*\][^}]*\}/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"teaching_experiences"\[[^\]]*\][^}]*\}/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"work_experiences"\[[^\]]*\][^}]*\}/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"examining_experiences"\[[^\]]*\][^}]*\}/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"training_courses"\[[^\]]*\][^}]*\}/g, "");

      // Pattern 2: JSON objects with empty arrays (standard format)
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"teaching_experiences"\s*:\s*\[\][^}]*\}/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"work_experiences"\s*:\s*\[\][^}]*\}/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"examining_experiences"\s*:\s*\[\][^}]*\}/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"training_courses"\s*:\s*\[\][^}]*\}/g, "");

      // Pattern 3: Standalone JSON fragments starting with comma (like ,"teaching_experiences":[],...)
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"teaching_experiences"\s*:\s*\[\]/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"work_experiences"\s*:\s*\[\]/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"examining_experiences"\s*:\s*\[\]/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"training_courses"\s*:\s*\[\]/g, "");

      // Pattern 4: Remove trailing closing braces and commas that might be left
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*\}/g, "}");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/^\s*,\s*/g, "");
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*$/g, "");

      // Pattern 5: Remove any remaining JSON objects that only contain empty arrays (multiline)
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{[^}]*"teaching_experiences"\s*:\s*\[\]\s*,\s*"work_experiences"\s*:\s*\[\]\s*,\s*"examining_experiences"\s*:\s*\[\]\s*,\s*"training_courses"\s*:\s*\[\][^}]*\}/g, "");

      // Pattern 6: Remove any JSON-like structures with whitespace/newlines
      cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/\{\s*"teaching_experiences"\s*:\s*\[\]\s*,\s*"work_experiences"\s*:\s*\[\]\s*,\s*"examining_experiences"\s*:\s*\[\]\s*,\s*"training_courses"\s*:\s*\[\]\s*\}/g, "");

      // Pattern 7: Remove multiple occurrences of the same pattern (handle repeated artifacts)
      let prevLength = 0;
      while (cleanedAdditionalInfo && cleanedAdditionalInfo.length !== prevLength) {
        prevLength = cleanedAdditionalInfo.length;
        cleanedAdditionalInfo = cleanedAdditionalInfo.replace(/,\s*"teaching_experiences"\s*:\s*\[\]\s*,\s*"work_experiences"\s*:\s*\[\]\s*,\s*"examining_experiences"\s*:\s*\[\]\s*,\s*"training_courses"\s*:\s*\[\]/g, "");
      }

      cleanedAdditionalInfo = cleanedAdditionalInfo.trim();
      // If only whitespace remains, set to null
      if (!cleanedAdditionalInfo || cleanedAdditionalInfo.length === 0) {
        cleanedAdditionalInfo = null;
      }
    }
    const title = d.title === "__none__" ? undefined : d.title;
    return {
      full_name: d.full_name,
      title,
      region: d.region ? (d.region as GhanaRegion) : undefined,
      nationality: d.nationality,
      date_of_birth: d.date_of_birth || null,
      office_address: d.office_address || null,
      residential_address: d.residential_address || null,
      email_address: d.email_address,
      telephone_office: d.telephone_office || null,
      telephone_cell: d.telephone_cell || null,
      present_school_institution: d.present_school_institution || null,
      present_rank_position: d.present_rank_position || null,
      subject_area: d.subject_type || null,
      subject_id: d.subject_id || null,
      additional_information: cleanedAdditionalInfo,
      ceased_examining_explanation: d.ceased_examining_explanation || null,
      last_completed_step: step,
      qualifications: qualifications.length > 0 ? qualifications : undefined,
      teaching_experiences: teaching_experiences.length > 0 ? teaching_experiences : undefined,
      work_experiences: work_experiences.length > 0 ? work_experiences : undefined,
      examining_experiences: examining_experiences.length > 0 ? examining_experiences : undefined,
      training_courses: training_courses.length > 0 ? training_courses : undefined,
    };
  };

  const validateStep = async (step: number): Promise<boolean> => {
    if ([3, 4, 5, 6, 7, 9, 10, 11].includes(step)) {
      setCompletedSteps((prev) => new Set([...prev, step]));
      return true;
    }

    clearErrors();

    type StepSchema = z.ZodType<object>;
    let schema: StepSchema;
    let payload: object;

    switch (step) {
      case 1: {
        const v = getValues();
        schema = step1Schema as StepSchema;
        payload = {
          full_name: v.full_name,
          title: v.title,
          region: v.region,
          nationality: v.nationality,
          date_of_birth: v.date_of_birth,
          office_address: v.office_address,
          residential_address: v.residential_address,
          email_address: v.email_address,
          telephone_office: v.telephone_office,
          telephone_cell: v.telephone_cell,
          present_school_institution: v.present_school_institution,
          present_rank_position: v.present_rank_position,
        };
        break;
      }
      case 2: {
        const v = getValues();
        schema = step2Schema as StepSchema;
        payload = { subject_type: v.subject_type, subject_id: v.subject_id };
        break;
      }
      case 8: {
        const v = getValues();
        schema = step8Schema as StepSchema;
        payload = {
          additional_information: v.additional_information,
          ceased_examining_explanation: v.ceased_examining_explanation,
        };
        break;
      }
      default:
        return true;
    }

    try {
      await schema.parseAsync(payload);
      setCompletedSteps((prev) => new Set([...prev, step]));
      return true;
    } catch (err) {
      if (err instanceof z.ZodError) {
        for (const issue of err.issues) {
          const path = issue.path.join(".") || "root";
          setError(path as keyof MultiStepFormData, {
            type: "manual",
            message: issue.message,
          });
        }
      }
      return false;
    }
  };

  const handleNext = async () => {
    try {
      const isValid = await validateStep(currentStep);
    if (!isValid) {
      toast.error("Please fix the errors below before continuing.");
      return;
    }
    if (currentStep >= STEPS.length) return;

    const nextStep = currentStep + 1;

    if (!activeDraftId && currentStep === 1) {
      const payload = buildCreatePayload();
      const id = await onCreateDraft(payload);
      setLocalDraftId(id);
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      setCurrentStep(nextStep);
      return;
    }

    if (activeDraftId && currentStep >= 1 && currentStep <= 8) {
      const payload = buildUpdatePayload(currentStep);
      try {
        await onSaveDraft(payload, currentStep);
        // Only advance step if save was successful
        setCompletedSteps((prev) => new Set([...prev, currentStep]));
        setCurrentStep(nextStep);
      } catch (saveError) {
        // If save fails, show error but don't block navigation if it's a non-critical error
        const errorMessage = saveError instanceof Error ? saveError.message : "Failed to save progress";
        toast.error(errorMessage);
        // Still allow navigation to next step even if save fails
        // User can manually save later
        setCompletedSteps((prev) => new Set([...prev, currentStep]));
        setCurrentStep(nextStep);
      }
      return;
    }

    if (currentStep === 9 && activeDraftId) {
      // Documents step - photograph and at least one certificate required
      const hasPhotograph = documents.some((d) => d.document_type === "PHOTOGRAPH");
      const certificateCount = documents.filter((d) => d.document_type === "CERTIFICATE").length;
      if (!hasPhotograph) {
        toast.error("A photograph is required before continuing.");
        return;
      }
      if (certificateCount < 1) {
        toast.error("At least one certificate is required before continuing.");
        return;
      }
      const payload = buildUpdatePayload(9);
      try {
        await onSaveDraft(payload, 9);
        setCompletedSteps((prev) => new Set([...prev, 9]));
        setCurrentStep(10);
      } catch (saveError) {
        const errorMessage = saveError instanceof Error ? saveError.message : "Failed to save progress";
        toast.error(errorMessage);
        setCompletedSteps((prev) => new Set([...prev, 9]));
        setCurrentStep(10);
      }
      return;
    }

    if (currentStep === 10 && activeDraftId) {
        const payload = buildUpdatePayload(10);
        try {
          await onSaveDraft(payload, 10);
          setCompletedSteps((prev) => new Set([...prev, 10]));
          setCurrentStep(11);
        } catch (saveError) {
          const errorMessage = saveError instanceof Error ? saveError.message : "Failed to save progress";
          toast.error(errorMessage);
          // Still allow navigation to review step
          setCompletedSteps((prev) => new Set([...prev, 10]));
          setCurrentStep(11);
        }
        return;
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    }
  };

  const handlePrevious = async () => {
    if (currentStep <= 1) return;
    const prevStep = currentStep - 1;
    if (activeDraftId && currentStep >= 2 && currentStep <= 11) {
      try {
        const payload = buildUpdatePayload(prevStep);
        await onSaveDraft(payload, prevStep);
      } catch {
        // still allow going back
      }
    }
    setCurrentStep(prevStep);
  };

  const handlePayment = async () => {
    if (!activeDraftId) return;
    setPaymentLoading(true);
    try {
      await initializeApplicationPayment(activeDraftId);
      const p = await getApplicationPrice(activeDraftId);
      setPriceData({
        application_fee: p.application_fee,
        outstanding_amount: p.outstanding_amount,
        payment_required: p.payment_required,
        has_pricing: p.has_pricing,
      });
      toast.success("Payment complete");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setPaymentLoading(false);
    }
  };

  const handleFormSubmit = async () => {
    await onSubmitApplication();
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="full_name">
                  Full Name <span className="text-destructive">*</span>
                </Label>
                <Input id="full_name" {...register("full_name")} disabled={loading} />
                {errors.full_name && (
                  <p className="text-sm text-destructive">{errors.full_name.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">
                  Title <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="title"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value ?? "__none__"}
                      onValueChange={(v) => field.onChange(v)}
                      disabled={loading}
                    >
                      <SelectTrigger id="title">
                        <SelectValue placeholder="Select title" />
                      </SelectTrigger>
                      <SelectContent>
                        {TITLE_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.title && (
                  <p className="text-sm text-destructive">{errors.title.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="nationality">Nationality</Label>
                <Input id="nationality" {...register("nationality")} disabled={loading} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="region">
                  Region <span className="text-destructive">*</span>
                </Label>
                <Controller
                  name="region"
                  control={control}
                  render={({ field }) => (
                    <Select
                      value={field.value || "__none__"}
                      onValueChange={(v) => field.onChange(v === "__none__" ? "" : v)}
                      disabled={loading}
                    >
                      <SelectTrigger id="region">
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select region</SelectItem>
                        {GHANA_REGIONS.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.region && (
                  <p className="text-sm text-destructive">{errors.region.message}</p>
                )}
              </div>
              <Controller
                name="date_of_birth"
                control={control}
                render={({ field }) => (
                  <DatePicker
                    label="Date of Birth"
                    value={field.value}
                    onChange={field.onChange}
                    disabled={loading}
                    placeholder="Pick date of birth"
                    max={format(new Date(), "yyyy-MM-dd")}
                    dropdown
                  />
                )}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="office_address">Office Address</Label>
              <Textarea
                id="office_address"
                {...register("office_address")}
                disabled={loading}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="residential_address">Residential Address</Label>
              <Textarea
                id="residential_address"
                {...register("residential_address")}
                disabled={loading}
                rows={3}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="email_address">
                  Email Address <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="email_address"
                  type="email"
                  {...register("email_address")}
                  disabled={loading}
                />
                {errors.email_address && (
                  <p className="text-sm text-destructive">{errors.email_address.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="telephone_office">Telephone (Office)</Label>
                <Input
                  id="telephone_office"
                  type="tel"
                  {...register("telephone_office")}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="telephone_cell">
                  Telephone (Cell) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="telephone_cell"
                  type="tel"
                  {...register("telephone_cell")}
                  disabled={loading}
                />
                {errors.telephone_cell && (
                  <p className="text-sm text-destructive">{errors.telephone_cell.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="present_school_institution">Present School/Institution</Label>
                <Input
                  id="present_school_institution"
                  {...register("present_school_institution")}
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="present_rank_position">Present Rank/Position</Label>
                <Input
                  id="present_rank_position"
                  {...register("present_rank_position")}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="subject_type">
                Subject Type <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="subject_type"
                control={control}
                render={({ field }) => (
                  <Select
                    value={field.value || ""}
                    onValueChange={(v) => {
                      field.onChange(v);
                      setValue("subject_id", null);
                    }}
                    disabled={loading}
                  >
                    <SelectTrigger id="subject_type" className="w-full">
                      <SelectValue placeholder="Select subject type" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjectTypeOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.subject_type && (
                <p className="text-sm text-destructive">{errors.subject_type.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject_id">
                Subject <span className="text-destructive">*</span>
              </Label>
              <Controller
                name="subject_id"
                control={control}
                render={({ field }) => (
                  <SearchableSubjectSelect
                    id="subject_id"
                    subjects={subjectsByType}
                    value={field.value}
                    onValueChange={field.onChange}
                    placeholder={
                      getValues("subject_type")
                        ? "Search or select subject..."
                        : "Select a subject type first"
                    }
                    disabled={loading || !getValues("subject_type")}
                    aria-invalid={!!errors.subject_id}
                    aria-describedby={errors.subject_id ? "subject_id_error" : undefined}
                  />
                )}
              />
              {errors.subject_id && (
                <p id="subject_id_error" className="text-sm text-destructive" role="alert">
                  {errors.subject_id.message}
                </p>
              )}
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Add your academic qualifications (optional)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendQualification({
                    university_college: "",
                    degree_type: "Other",
                    programme: null,
                    class_of_degree: null,
                    major_subjects: null,
                    date_of_award: null,
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Qualification
              </Button>
            </div>
            {qualificationFields.map((field, index) => (
              <Card key={field.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Qualification {index + 1}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeQualification(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        University/College <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(`qualifications.${index}.university_college`)}
                        disabled={loading}
                      />
                      {errors.qualifications?.[index]?.university_college && (
                        <p className="text-sm text-destructive">
                          {errors.qualifications[index]?.university_college?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Degree type <span className="text-destructive">*</span>
                      </Label>
                      <Controller
                        name={`qualifications.${index}.degree_type`}
                        control={control}
                        render={({ field }) => (
                          <Select
                            value={field.value}
                            onValueChange={field.onChange}
                            disabled={loading}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select degree type" />
                            </SelectTrigger>
                            <SelectContent>
                              {DEGREE_TYPES.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                      {errors.qualifications?.[index]?.degree_type && (
                        <p className="text-sm text-destructive">
                          {errors.qualifications[index]?.degree_type?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Programme</Label>
                      <Input
                        {...register(`qualifications.${index}.programme`)}
                        disabled={loading}
                        placeholder="e.g. Mathematics Education"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Class of Degree</Label>
                      <Input
                        {...register(`qualifications.${index}.class_of_degree`)}
                        disabled={loading}
                      />
                    </div>
                    <Controller
                      name={`qualifications.${index}.date_of_award`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Date of Award"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={loading}
                          placeholder="Pick date"
                          dropdown
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Major Subjects</Label>
                    <Textarea
                      {...register(`qualifications.${index}.major_subjects`)}
                      disabled={loading}
                      rows={2}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
            {qualificationFields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No qualifications added yet. Click "Add Qualification" to add one.
              </div>
            )}
          </div>
        );

      case 4:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Add your teaching experiences (optional)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendTeaching({
                    institution_name: "",
                    date_from: null,
                    date_to: null,
                    subject: null,
                    level: null,
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Experience
              </Button>
            </div>
            {teachingFields.map((field, index) => (
              <Card key={field.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Teaching Experience {index + 1}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTeaching(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        Institution Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(`teaching_experiences.${index}.institution_name`)}
                        disabled={loading}
                      />
                      {errors.teaching_experiences?.[index]?.institution_name && (
                        <p className="text-sm text-destructive">
                          {errors.teaching_experiences[index]?.institution_name?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input
                        {...register(`teaching_experiences.${index}.subject`)}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Level</Label>
                      <Controller
                        name={`teaching_experiences.${index}.level`}
                        control={control}
                        render={({ field }) => (
                          <Select
                            value={field.value ?? ""}
                            onValueChange={(v) => field.onChange(v || null)}
                            disabled={loading}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select level" />
                            </SelectTrigger>
                            <SelectContent>
                              {TEACHING_LEVELS.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <Controller
                      name={`teaching_experiences.${index}.date_from`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Date From"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={loading}
                          placeholder="Pick date"
                          dropdown
                        />
                      )}
                    />
                    <Controller
                      name={`teaching_experiences.${index}.date_to`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Date To"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={loading}
                          placeholder="Pick date"
                          dropdown
                        />
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
            {teachingFields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No teaching experiences added yet. Click "Add Experience" to add one.
              </div>
            )}
          </div>
        );

      case 5:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Add your work experiences (optional)</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendWork({
                    occupation: "",
                    employer_name: "",
                    date_from: null,
                    date_to: null,
                    position_held: null,
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Experience
              </Button>
            </div>
            {workFields.map((field, index) => (
              <Card key={field.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Work Experience {index + 1}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeWork(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        Occupation <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(`work_experiences.${index}.occupation`)}
                        disabled={loading}
                      />
                      {errors.work_experiences?.[index]?.occupation && (
                        <p className="text-sm text-destructive">
                          {errors.work_experiences[index]?.occupation?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Employer Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(`work_experiences.${index}.employer_name`)}
                        disabled={loading}
                      />
                      {errors.work_experiences?.[index]?.employer_name && (
                        <p className="text-sm text-destructive">
                          {errors.work_experiences[index]?.employer_name?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Position Held</Label>
                      <Input
                        {...register(`work_experiences.${index}.position_held`)}
                        disabled={loading}
                      />
                    </div>
                    <Controller
                      name={`work_experiences.${index}.date_from`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Date From"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={loading}
                          placeholder="Pick date"
                          dropdown
                        />
                      )}
                    />
                    <Controller
                      name={`work_experiences.${index}.date_to`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Date To"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={loading}
                          placeholder="Pick date"
                          dropdown
                        />
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
            {workFields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No work experiences added yet. Click "Add Experience" to add one.
              </div>
            )}
          </div>
        );

      case 6:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Add your examining experiences (optional)
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendExamining({
                    examination_body: "",
                    subject: null,
                    level: null,
                    status: null,
                    date_from: null,
                    date_to: null,
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Experience
              </Button>
            </div>
            {examiningFields.map((field, index) => (
              <Card key={field.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Examining Experience {index + 1}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeExamining(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        Examination Body <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(`examining_experiences.${index}.examination_body`)}
                        disabled={loading}
                      />
                      {errors.examining_experiences?.[index]?.examination_body && (
                        <p className="text-sm text-destructive">
                          {errors.examining_experiences[index]?.examination_body?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Subject</Label>
                      <Input
                        {...register(`examining_experiences.${index}.subject`)}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Level</Label>
                      <Input
                        {...register(`examining_experiences.${index}.level`)}
                        disabled={loading}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Controller
                        name={`examining_experiences.${index}.status`}
                        control={control}
                        render={({ field }) => (
                          <Select
                            value={field.value ?? "__none__"}
                            onValueChange={(v) =>
                              field.onChange(v === "__none__" ? "" : v)
                            }
                            disabled={loading}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              {EXAMINING_STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                    <Controller
                      name={`examining_experiences.${index}.date_from`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Date From"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={loading}
                          placeholder="Pick date"
                          dropdown
                        />
                      )}
                    />
                    <Controller
                      name={`examining_experiences.${index}.date_to`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Date To"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={loading}
                          placeholder="Pick date"
                          dropdown
                        />
                      )}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
            {examiningFields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No examining experiences added yet. Click "Add Experience" to add one.
              </div>
            )}
          </div>
        );

      case 7:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Add training courses (optional)</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  appendTraining({
                    organizer: "",
                    course_name: "",
                    place: null,
                    date_from: null,
                    date_to: null,
                    reason_for_participation: null,
                  })
                }
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Course
              </Button>
            </div>
            {trainingFields.map((field, index) => (
              <Card key={field.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Training Course {index + 1}</CardTitle>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeTraining(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>
                        Organizer <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(`training_courses.${index}.organizer`)}
                        disabled={loading}
                      />
                      {errors.training_courses?.[index]?.organizer && (
                        <p className="text-sm text-destructive">
                          {errors.training_courses[index]?.organizer?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>
                        Course Name <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        {...register(`training_courses.${index}.course_name`)}
                        disabled={loading}
                      />
                      {errors.training_courses?.[index]?.course_name && (
                        <p className="text-sm text-destructive">
                          {errors.training_courses[index]?.course_name?.message}
                        </p>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>Place</Label>
                      <Input {...register(`training_courses.${index}.place`)} disabled={loading} />
                    </div>
                    <Controller
                      name={`training_courses.${index}.date_from`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Date From"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={loading}
                          placeholder="Pick date"
                          dropdown
                        />
                      )}
                    />
                    <Controller
                      name={`training_courses.${index}.date_to`}
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Date To"
                          value={field.value}
                          onChange={field.onChange}
                          disabled={loading}
                          placeholder="Pick date"
                          dropdown
                        />
                      )}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Reason for Participation</Label>
                    <Textarea
                      {...register(`training_courses.${index}.reason_for_participation`)}
                      disabled={loading}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
            {trainingFields.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No training courses added yet. Click "Add Course" to add one.
              </div>
            )}
          </div>
        );

      case 8:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="additional_information">Additional Information</Label>
              <Textarea
                id="additional_information"
                {...register("additional_information")}
                placeholder="Any additional information you would like to provide"
                disabled={loading}
                rows={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ceased_examining_explanation">
                Ceased Examining Explanation (if applicable)
              </Label>
              <Textarea
                id="ceased_examining_explanation"
                {...register("ceased_examining_explanation")}
                placeholder="If you have previously ceased examining, please provide an explanation"
                disabled={loading}
                rows={4}
              />
            </div>
          </div>
        );

      case 9:
        if (!activeDraftId) {
          return (
            <div className="space-y-4">
              <p className="text-muted-foreground">
                Please complete the previous steps first to upload documents.
              </p>
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              A photograph and at least one certificate are required before you can continue.
            </p>
            <DocumentUpload
              applicationId={activeDraftId}
              documents={documents}
              onUploadSuccess={(updatedDocuments) => {
                setDocuments(updatedDocuments);
                toast.success("Document uploaded successfully");
              }}
            />
            {documents.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Uploaded Documents</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-2 border rounded">
                        <div>
                          <p className="font-medium">{doc.file_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {doc.document_type} • {(doc.file_size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );

      case 10:
        return (
          <div className="space-y-4">
            {priceData?.has_pricing ? (
              <>
                <p className="text-muted-foreground">
                  Application fee: {(priceData.application_fee ?? 0).toFixed(2)} (mock payment)
                </p>
                {priceData.payment_required ? (
                  <Button
                    type="button"
                    onClick={handlePayment}
                    disabled={paymentLoading || loading}
                  >
                    {paymentLoading ? "Processing…" : "Pay now (mock)"}
                  </Button>
                ) : (
                  <p className="text-sm text-green-600">Payment complete. Proceed to Review.</p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">Loading price…</p>
            )}
          </div>
        );

      case 11: {
        const d = getValues();
        return (
          <div className="space-y-6 max-w-4xl mx-auto">
            <div className="bg-muted p-4 rounded-lg">
              <h3 className="font-semibold mb-2">Review Your Application</h3>
              <p className="text-sm text-muted-foreground">
                Please review all the information you've provided. Once you submit, your application will be sent for review.
              </p>
            </div>

            {/* Personal Particulars */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Personal Particulars</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Full Name</p>
                    <p className="font-medium mt-1">{d.full_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Title</p>
                    <p className="font-medium mt-1">{d.title || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Email Address</p>
                    <p className="font-medium mt-1 break-all">{d.email_address || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Nationality</p>
                    <p className="font-medium mt-1">{d.nationality || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Region</p>
                    <p className="font-medium mt-1">{d.region || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Date of Birth</p>
                    <p className="font-medium mt-1">
                      {d.date_of_birth ? format(new Date(d.date_of_birth), "PPP") : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Phone</p>
                    <p className="font-medium mt-1">{d.telephone_cell || d.telephone_office || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Office Phone</p>
                    <p className="font-medium mt-1">{d.telephone_office || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Cell Phone</p>
                    <p className="font-medium mt-1">{d.telephone_cell || "—"}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-muted-foreground text-xs">Office Address</p>
                    <p className="font-medium mt-1 whitespace-pre-wrap">{d.office_address || "—"}</p>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-muted-foreground text-xs">Residential Address</p>
                    <p className="font-medium mt-1 whitespace-pre-wrap">{d.residential_address || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Present School/Institution</p>
                    <p className="font-medium mt-1">{d.present_school_institution || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Present Rank/Position</p>
                    <p className="font-medium mt-1">{d.present_rank_position || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Subject */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Subject</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {initialData?.subject?.name ??
                    subjectsByType.find((s) => s.id === d.subject_id)?.name ??
                    d.subject_id ??
                    "—"}
                </p>
              </CardContent>
            </Card>

            {/* Qualifications */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Academic Qualifications ({d.qualifications?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {d.qualifications && d.qualifications.length > 0 ? (
                  <div className="space-y-4">
                    {d.qualifications.map((q, idx) => (
                      <div key={idx} className="border rounded-lg p-4 space-y-2">
                        <div className="grid gap-2 md:grid-cols-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">University/College</p>
                            <p className="font-medium mt-1">{q.university_college}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Degree type</p>
                            <p className="font-medium mt-1">{q.degree_type}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Programme</p>
                            <p className="font-medium mt-1">{q.programme || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Class of Degree</p>
                            <p className="font-medium mt-1">{q.class_of_degree || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Date of Award</p>
                            <p className="font-medium mt-1">
                              {q.date_of_award ? format(new Date(q.date_of_award), "PPP") : "—"}
                            </p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-muted-foreground text-xs">Major Subjects</p>
                            <p className="font-medium mt-1 whitespace-pre-wrap">{q.major_subjects || "—"}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No qualifications added</p>
                )}
              </CardContent>
            </Card>

            {/* Teaching Experiences */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Teaching Experience ({d.teaching_experiences?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {d.teaching_experiences && d.teaching_experiences.length > 0 ? (
                  <div className="space-y-4">
                    {d.teaching_experiences.map((t, idx) => (
                      <div key={idx} className="border rounded-lg p-4 space-y-2">
                        <div className="grid gap-2 md:grid-cols-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Institution Name</p>
                            <p className="font-medium mt-1">{t.institution_name}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Subject</p>
                            <p className="font-medium mt-1">{t.subject || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Level</p>
                            <p className="font-medium mt-1">{t.level || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Date From</p>
                            <p className="font-medium mt-1">
                              {t.date_from ? format(new Date(t.date_from), "PPP") : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Date To</p>
                            <p className="font-medium mt-1">
                              {t.date_to ? format(new Date(t.date_to), "PPP") : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No teaching experiences added</p>
                )}
              </CardContent>
            </Card>

            {/* Work Experiences */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Work Experience ({d.work_experiences?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {d.work_experiences && d.work_experiences.length > 0 ? (
                  <div className="space-y-4">
                    {d.work_experiences.map((w, idx) => (
                      <div key={idx} className="border rounded-lg p-4 space-y-2">
                        <div className="grid gap-2 md:grid-cols-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Occupation</p>
                            <p className="font-medium mt-1">{w.occupation}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Employer Name</p>
                            <p className="font-medium mt-1">{w.employer_name}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Position Held</p>
                            <p className="font-medium mt-1">{w.position_held || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Date From</p>
                            <p className="font-medium mt-1">
                              {w.date_from ? format(new Date(w.date_from), "PPP") : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Date To</p>
                            <p className="font-medium mt-1">
                              {w.date_to ? format(new Date(w.date_to), "PPP") : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No work experiences added</p>
                )}
              </CardContent>
            </Card>

            {/* Examining Experiences */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Examining Experience ({d.examining_experiences?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {d.examining_experiences && d.examining_experiences.length > 0 ? (
                  <div className="space-y-4">
                    {d.examining_experiences.map((e, idx) => (
                      <div key={idx} className="border rounded-lg p-4 space-y-2">
                        <div className="grid gap-2 md:grid-cols-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Examination Body</p>
                            <p className="font-medium mt-1">{e.examination_body}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Subject</p>
                            <p className="font-medium mt-1">{e.subject || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Level</p>
                            <p className="font-medium mt-1">{e.level || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Status</p>
                            <p className="font-medium mt-1">{e.status || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Date From</p>
                            <p className="font-medium mt-1">
                              {e.date_from ? format(new Date(e.date_from), "PPP") : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Date To</p>
                            <p className="font-medium mt-1">
                              {e.date_to ? format(new Date(e.date_to), "PPP") : "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No examining experiences added</p>
                )}
              </CardContent>
            </Card>

            {/* Training Courses */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">
                  Training Courses ({d.training_courses?.length || 0})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {d.training_courses && d.training_courses.length > 0 ? (
                  <div className="space-y-4">
                    {d.training_courses.map((t, idx) => (
                      <div key={idx} className="border rounded-lg p-4 space-y-2">
                        <div className="grid gap-2 md:grid-cols-2 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Organizer</p>
                            <p className="font-medium mt-1">{t.organizer}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Course Name</p>
                            <p className="font-medium mt-1">{t.course_name}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Place</p>
                            <p className="font-medium mt-1">{t.place || "—"}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Date From</p>
                            <p className="font-medium mt-1">
                              {t.date_from ? format(new Date(t.date_from), "PPP") : "—"}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Date To</p>
                            <p className="font-medium mt-1">
                              {t.date_to ? format(new Date(t.date_to), "PPP") : "—"}
                            </p>
                          </div>
                          <div className="md:col-span-2">
                            <p className="text-muted-foreground text-xs">Reason for Participation</p>
                            <p className="font-medium mt-1 whitespace-pre-wrap">
                              {t.reason_for_participation || "—"}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No training courses added</p>
                )}
              </CardContent>
            </Card>

            {/* Additional Information */}
            {(d.additional_information || d.ceased_examining_explanation) && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Additional Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {d.additional_information && (
                    <div>
                      <p className="text-muted-foreground text-xs mb-2">Additional Information</p>
                      <p className="text-sm whitespace-pre-wrap">{d.additional_information}</p>
                    </div>
                  )}
                  {d.ceased_examining_explanation && (
                    <div>
                      <p className="text-muted-foreground text-xs mb-2">
                        Ceased Examining Explanation
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{d.ceased_examining_explanation}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Documents ({documents.length})</CardTitle>
              </CardHeader>
              <CardContent>
                {documents.length > 0 ? (
                  <div className="space-y-2">
                    {documents.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-2 p-2 border rounded">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm flex-1">{doc.file_name}</span>
                        <Badge variant="outline" className="text-xs">
                          {doc.document_type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          ({(doc.file_size / 1024 / 1024).toFixed(2)} MB)
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No documents uploaded</p>
                )}
              </CardContent>
            </Card>
          </div>
        );
      }

      default:
        return null;
    }
  };

  const handleSaveAndExit = async () => {
    if (!activeDraftId) {
      toast.error("Save step 1 first before exiting.");
      return;
    }
    try {
      // Save current step before exiting
      const stepToSave = currentStep <= 9 ? currentStep : 9;
      const payload = buildUpdatePayload(stepToSave);
      await onSaveDraft(payload, stepToSave);
      toast.success("Progress saved. Logging out...");
      // Call parent's onSaveAndExit which handles logout
      onSaveAndExit();
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Failed to save";
      toast.error(errorMessage);
      // Still allow exit even if save fails - user can try again later
      onSaveAndExit();
    }
  };

  const isPaymentStep = currentStep === 10;
  const isReviewStep = currentStep === 11;
  const nextDisabled =
    loading ||
    saving ||
    (isPaymentStep && !!priceData?.payment_required);

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* Step Indicator */}
      <Card>
        <CardHeader>
          <CardTitle>Application Form - Step {currentStep} of {STEPS.length}</CardTitle>
          <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-6">
            {STEPS.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
                      currentStep > step.id
                        ? "bg-primary border-primary text-primary-foreground"
                        : currentStep === step.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted bg-muted text-muted-foreground"
                    }`}
                  >
                    {currentStep > step.id ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <span>{step.id}</span>
                    )}
                  </div>
                  <p
                    className={`text-xs mt-2 text-center ${
                      currentStep >= step.id ? "text-foreground" : "text-muted-foreground"
                    }`}
                  >
                    {step.title}
                  </p>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 ${
                      currentStep > step.id ? "bg-primary" : "bg-muted"
                    }`}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Step Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep - 1].title}</CardTitle>
          <CardDescription>{STEPS[currentStep - 1].description}</CardDescription>
        </CardHeader>
        <CardContent>{renderStepContent()}</CardContent>
      </Card>

      {/* Navigation Buttons */}
      <div className="flex justify-between flex-wrap gap-2">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1 || loading || saving}
          >
            <ChevronLeft className="mr-2 h-4 w-4" />
            Previous
          </Button>
          {activeDraftId && !isReviewStep && (
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveAndExit}
              disabled={loading || saving}
            >
              Save and Exit
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          {!isReviewStep ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={nextDisabled}
            >
              Save and Continue
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={loading || saving}>
              {loading || saving ? "Submitting…" : "Submit application"}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
