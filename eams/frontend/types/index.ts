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

export interface ExaminerApplicationCreate {
  full_name: string;
  title?: string | null;
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
  additional_information?: string | null;
  ceased_examining_explanation?: string | null;
}

export interface ExaminerApplicationUpdate {
  full_name?: string | null;
  title?: string | null;
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
}

export interface ApplicationSubmitResponse {
  message: string;
  application_id: string;
  application_number: string;
}

// Qualification types
export interface Qualification {
  university_college: string;
  degree_diploma: string;
  class_of_degree?: string | null;
  major_subjects?: string | null;
  date_of_award?: string | null; // ISO date string
}

// Teaching Experience types
export interface TeachingExperience {
  institution_name: string;
  date_from?: string | null;
  date_to?: string | null;
  subject?: string | null;
  level?: string | null;
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
  recommender_name?: string | null;
  recommender_status?: string | null;
  recommender_office_address?: string | null;
  recommender_phone?: string | null;
  quality_ratings?: Record<string, number> | null;
  integrity_assessment?: string | null;
  certification_statement?: string | null;
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
