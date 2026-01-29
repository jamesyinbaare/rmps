// User types
export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface UserCreate {
  email: string;
  password: string;
  full_name: string;
}

export interface UserLogin {
  email: string;
  password: string;
}

export interface UserResponse {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
}

/** GET /me response; includes examiner_id when user has examiner profile. */
export interface UserMeResponse extends UserResponse {
  examiner_id: string | null;
}

// Examiner Application types
export type ExaminerApplicationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "ACCEPTED"
  | "REJECTED";

/** Ghana regions for examiner application (values match backend GhanaRegion enum). */
export const GHANA_REGIONS = [
  "Ashanti Region",
  "Bono Region",
  "Bono East Region",
  "Ahafo Region",
  "Central Region",
  "Eastern Region",
  "Greater Accra Region",
  "Northern Region",
  "North East Region",
  "Savannah Region",
  "Upper East Region",
  "Upper West Region",
  "Volta Region",
  "Oti Region",
  "Western Region",
  "Western North Region",
] as const;

export type GhanaRegion = (typeof GHANA_REGIONS)[number];

export interface ExaminerApplicationCreate {
  full_name: string;
  title?: string | null;
  region: GhanaRegion;
  nationality?: string | null;
  date_of_birth?: string | null; // ISO date string
  office_address?: string | null;
  residential_address?: string | null;
  email_address?: string | null;
  telephone_office?: string | null;
  telephone_cell?: string | null;
  present_school_institution?: string | null;
  present_rank_position?: string | null;
  subject_area?: string | null;
  subject_id?: string | null;
  additional_information?: string | null;
  ceased_examining_explanation?: string | null;
}

export interface ExaminerApplicationUpdate {
  full_name?: string | null;
  title?: string | null;
  region?: GhanaRegion | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  office_address?: string | null;
  residential_address?: string | null;
  email_address?: string | null;
  telephone_office?: string | null;
  telephone_cell?: string | null;
  present_school_institution?: string | null;
  present_rank_position?: string | null;
  subject_area?: string | null;
  subject_id?: string | null;
  additional_information?: string | null;
  ceased_examining_explanation?: string | null;
  last_completed_step?: number | null;
  qualifications?: Qualification[] | null;
  teaching_experiences?: TeachingExperience[] | null;
  work_experiences?: WorkExperience[] | null;
  examining_experiences?: ExaminingExperience[] | null;
  training_courses?: TrainingCourse[] | null;
}

export interface ExaminerApplicationResponse {
  id: string;
  examiner_id: string;
  application_number: string;
  status: ExaminerApplicationStatus;
  full_name: string;
  title?: string | null;
  region?: string | null;
  nationality?: string | null;
  date_of_birth?: string | null;
  office_address?: string | null;
  residential_address?: string | null;
  email_address?: string | null;
  telephone_office?: string | null;
  telephone_cell?: string | null;
  present_school_institution?: string | null;
  present_rank_position?: string | null;
  subject_area?: string | null;
  subject_id?: string | null;
  additional_information?: string | null;
  ceased_examining_explanation?: string | null;
  payment_status?: string | null;
  submitted_at?: string | null;
  last_completed_step?: number | null;
  created_at: string;
  updated_at: string;
  qualifications?: Qualification[] | null;
  teaching_experiences?: TeachingExperience[] | null;
  work_experiences?: WorkExperience[] | null;
  examining_experiences?: ExaminingExperience[] | null;
  training_courses?: TrainingCourse[] | null;
  recommendation_status?: { completed: boolean; recommender_name: string | null } | null;
  recommendation?: ExaminerRecommendationResponse | null;
  documents?: ExaminerApplicationDocumentResponse[] | null;
  subject?: Subject | null;
}

export interface ApplicationSubmitResponse {
  message: string;
  application_id: string;
  application_number: string;
}

// Degree type values (must match backend DegreeType enum)
export const DEGREE_TYPES = [
  "PhD",
  "M.Ed",
  "M.Sc",
  "B.Ed",
  "B.Sc",
  "Bachelor",
  "Diploma",
  "Other",
] as const;
export type DegreeType = (typeof DEGREE_TYPES)[number];

// Qualification types
export interface Qualification {
  university_college: string;
  degree_type: DegreeType;
  programme?: string | null;
  class_of_degree?: string | null;
  major_subjects?: string | null;
  date_of_award?: string | null; // ISO date string
}

// Teaching level values (must match backend TeachingLevel enum)
export const TEACHING_LEVELS = ["Tertiary", "SHS", "JHS", "Basic", "Other"] as const;
export type TeachingLevel = (typeof TEACHING_LEVELS)[number];

// Teaching Experience types
export interface TeachingExperience {
  institution_name: string;
  date_from?: string | null;
  date_to?: string | null;
  subject?: string | null;
  level?: TeachingLevel | null;
}

// Work Experience types
export interface WorkExperience {
  occupation: string;
  employer_name: string;
  date_from?: string | null;
  date_to?: string | null;
  position_held?: string | null;
}

// Examining Experience types
export interface ExaminingExperience {
  examination_body: string;
  subject?: string | null;
  level?: string | null;
  status?: string | null;
  date_from?: string | null;
  date_to?: string | null;
}

// Training Course types
export interface TrainingCourse {
  organizer: string;
  course_name: string;
  place?: string | null;
  date_from?: string | null;
  date_to?: string | null;
  reason_for_participation?: string | null;
}

// Subject Preference types
export type ExaminerSubjectPreferenceType =
  | "ELECTIVE"
  | "CORE"
  | "TECHNICAL_DRAWING_BUILDING"
  | "TECHNICAL_DRAWING_MECHANICAL"
  | "PRACTICAL_COMPONENT"
  | "ACCESS_COURSE";

// Subject type for application subject selection (first dropdown)
export type SubjectType =
  | "ELECTIVE"
  | "CORE"
  | "TECHNICAL_DRAWING_BUILDING_OPTION"
  | "TECHNICAL_DRAWING_MECHANICAL_OPTION"
  | "PRACTICAL";

export interface Subject {
  id: string;
  code: string;
  name: string;
  type: SubjectType | null;
  description?: string | null;
}

export interface SubjectTypeOption {
  value: string;
  label: string;
}

export interface SubjectPreference {
  preference_type: ExaminerSubjectPreferenceType;
  subject_area?: string | null;
}

// Document types
export type ExaminerDocumentType = "PHOTOGRAPH" | "CERTIFICATE" | "TRANSCRIPT";

export interface ExaminerApplicationDocumentResponse {
  id: string;
  application_id: string;
  document_type: ExaminerDocumentType;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
}

// Recommendation types
export interface ExaminerRecommendationTokenRequest {
  recommender_email: string;
  recommender_name: string;
}

export interface ExaminerRecommendationResponse {
  id: string;
  application_id: string;
  applicant_name?: string | null;
  recommender_name?: string | null;
  recommender_status?: string | null;
  recommender_office_address?: string | null;
  recommender_phone?: string | null;
  quality_ratings?: Record<string, number> | null;
  recommendation_decision?: boolean | null;
  recommender_signature?: string | null;
  recommender_date?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface RecommendationRequestResponse {
  message: string;
  recommender_email: string;
  token: string;
}

// Password change
export interface UserPasswordChange {
  current_password: string;
  new_password: string;
}

// Payment
export interface ApplicationPriceResponse {
  application_fee: number;
  total: number;
  payment_required: boolean;
  has_pricing: boolean;
  total_paid_amount: number;
  outstanding_amount: number;
  payment_status?: string;
}

export interface PaymentInitializeResponse {
  message: string;
  authorization_url: string | null;
  payment_status: string;
}

// Examiner profile (GET /examiner/me)
export interface ExaminerMeResponse {
  examiner_id: string;
  full_name: string;
  email_address: string | null;
}

// Admin - Examinations (type/series/year; aligns with registration portal)
export type ExamType =
  | "CERTIFICATE_II"
  | "ADVANCE"
  | "TECHNICIAN_PART_I"
  | "TECHNICIAN_PART_II"
  | "TECHNICIAN_PART_III"
  | "DIPLOMA";
export type ExamSeries = "MAY_JUNE" | "NOV_DEC";

export interface ExaminationResponse {
  id: string;
  type: ExamType;
  series: ExamSeries | null;
  year: number;
  acceptance_deadline: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExaminationCreate {
  type: ExamType;
  series?: ExamSeries | null;
  year: number;
  acceptance_deadline?: string | null;
}

export interface ExaminationUpdate {
  type?: ExamType | null;
  series?: ExamSeries | null;
  year?: number | null;
  acceptance_deadline?: string | null;
}

// Admin - Subject examiners (per examination + subject; replaces marking cycle)
export type SubjectExaminerStatus = "DRAFT" | "OPEN" | "ALLOCATED" | "CLOSED";
/** @deprecated Use SubjectExaminerStatus. Kept for backend enum name. */
export type MarkingCycleStatus = SubjectExaminerStatus;

export interface SubjectExaminerResponse {
  id: string;
  examination_id: string;
  subject_id: string;
  total_required: number;
  experience_ratio: number;
  status: SubjectExaminerStatus;
  created_at: string;
  updated_at: string;
  /** Display: examination type */
  examination_type?: ExamType | null;
  /** Display: examination series */
  examination_series?: ExamSeries | null;
  /** Display: examination year */
  examination_year?: number | null;
  /** Display: acceptance deadline from examination */
  acceptance_deadline?: string | null;
}

export interface SubjectExaminerCreate {
  subject_id: string;
  total_required: number;
  experience_ratio: number;
}

export interface SubjectExaminerUpdate {
  total_required?: number | null;
  experience_ratio?: number | null;
  status?: SubjectExaminerStatus | null;
}

// Admin - Quotas
export type QuotaType = "REGION" | "GENDER";

export interface SubjectQuotaResponse {
  id: string;
  subject_examiner_id: string;
  subject_id: string;
  quota_type: QuotaType;
  quota_key: string;
  min_count: number | null;
  max_count: number | null;
  percentage: number | null;
}

export interface SubjectQuotaCreate {
  quota_type: QuotaType;
  quota_key: string;
  min_count?: number | null;
  max_count?: number | null;
  percentage?: number | null;
}

export interface SubjectQuotaItem {
  quota_key: string;
  min_count?: number | null;
  max_count?: number | null;
  percentage?: number | null;
}

export interface SubjectQuotaBulkUpdate {
  region_quotas: SubjectQuotaItem[];
  gender_quotas: SubjectQuotaItem[];
}

// Admin - Allocations
export type AllocationStatus = "APPROVED" | "WAITLISTED" | "REJECTED";

export interface ExaminerAllocationResponse {
  id: string;
  examiner_id: string;
  subject_examiner_id: string;
  subject_id: string;
  score: number | null;
  rank: number | null;
  allocation_status: AllocationStatus;
  allocated_at: string;
}

/** Invitation list row with examiner name and region (admin list). */
export interface InvitationWithExaminerResponse extends ExaminerAllocationResponse {
  examiner_full_name: string | null;
  examiner_region: string | null;
}

export interface AllocationResult {
  approved: number;
  waitlisted: number;
  rejected: number;
  message: string;
}

// Examiner - My allocations (acceptances)
export type AcceptanceStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED";

/** Admin list of acceptances for a cycle/subject */
export interface AdminAcceptanceListResponse {
  id: string;
  examiner_id: string;
  examiner_full_name: string | null;
  examiner_region: string | null;
  status: AcceptanceStatus;
  notified_at: string | null;
  responded_at: string | null;
  response_deadline: string;
}

export interface ExaminerAcceptanceResponse {
  id: string;
  examiner_id: string;
  subject_examiner_id: string;
  subject_id: string;
  allocation_id: string;
  status: AcceptanceStatus;
  notified_at: string | null;
  responded_at: string | null;
  response_deadline: string;
  /** Display: subject code (e.g. MATH101) */
  subject_code?: string | null;
  /** Display: subject name */
  subject_name?: string | null;
  /** Display: examination year */
  examination_year?: number | null;
}

// Admin - Subject create and bulk upload
export interface SubjectCreate {
  code: string;
  name: string;
  type?: SubjectType | null;
  description?: string | null;
}

export interface SubjectBulkUploadError {
  row_number: number;
  error_message: string;
  field?: string | null;
}

export interface SubjectBulkUploadResponse {
  total_rows: number;
  successful: number;
  failed: number;
  errors: SubjectBulkUploadError[];
}
