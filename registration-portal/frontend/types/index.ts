// TypeScript types matching backend schemas

export interface User {
  id: string;
  email: string;
  full_name: string;
  user_type: "SYSTEM_ADMIN" | "SCHOOL_ADMIN" | "SCHOOL_USER" | "PRIVATE_USER";
  school_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_login: string | null;
}

export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface School {
  id: number;
  code: string;
  name: string;
  is_active?: boolean;
  is_private_examination_center?: boolean;
  created_at?: string;
  updated_at?: string;
  admin_count?: number;
  candidate_count?: number;
}

export interface SchoolDetail extends School {
  is_active: boolean;
  is_private_examination_center: boolean;
  created_at: string;
  updated_at: string;
}

export interface SchoolStatistics {
  school_id: number;
  school_code: string;
  school_name: string;
  total_candidates: number;
  candidates_by_exam: Record<string, number>;
  candidates_by_status: Record<string, number>;
  active_admin_count: number;
  total_exams: number;
}

export interface SchoolListResponse {
  items: School[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SchoolExam {
  exam_id: number;
  exam_type: string;
  exam_series: string;
  year: number;
  candidate_count: number;
}

export interface CandidateListResponse {
  items: RegistrationCandidate[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface RegistrationSubjectSelection {
  id: number;
  subject_id: number | null;
  subject_code: string;
  subject_name: string;
  series: number | null;
  created_at: string;
}

export interface RegistrationCandidate {
  id: number;
  registration_exam_id: number;
  school_id: number | null;
  portal_user_id: string | null;
  name: string;
  registration_number: string;
  index_number: string | null;
  date_of_birth: string | null;
  gender: string | null;
  programme_code: string | null;
  programme_id: number | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  national_id: string | null;
  registration_status: "PENDING" | "APPROVED" | "REJECTED" | "DRAFT";
  registration_date: string;
  created_at: string;
  updated_at: string;
  exam?: RegistrationExam;
  subject_selections?: RegistrationSubjectSelection[];
}

export interface ExamRegistrationPeriod {
  id: number;
  registration_start_date: string;
  registration_end_date: string;
  is_active: boolean;
  allows_bulk_registration: boolean;
  allows_private_registration: boolean;
  created_at: string;
  updated_at: string;
}

export interface RegistrationExam {
  id: number;
  exam_id_main_system: number | null;
  exam_type: string;
  exam_series: string;
  year: number;
  description: string | null;
  registration_period: ExamRegistrationPeriod;
  created_at: string;
  updated_at: string;
}

export interface RegistrationExamCreate {
  exam_id_main_system?: number | null;
  exam_type: string;
  exam_series: string;
  year: number;
  description?: string | null;
  registration_period: {
    registration_start_date: string;
    registration_end_date: string;
    allows_bulk_registration?: boolean;
    allows_private_registration?: boolean;
  };
}

export interface SchoolAdminCreate {
  email: string;
  password: string;
  full_name: string;
  school_id: number;
}

export interface RegistrationCandidateCreate {
  name: string;
  date_of_birth?: string | null;
  gender?: string | null;
  programme_code?: string | null;
  programme_id?: number | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  national_id?: string | null;
  subject_codes?: string[];
  subject_ids?: number[];
}

// Programme types
export interface Programme {
  id: number;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProgrammeListResponse {
  items: Programme[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ProgrammeSubjectResponse {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_type: "CORE" | "ELECTIVE";
  is_compulsory: boolean | null;
  choice_group_id: number | null;
  created_at: string;
}

export interface SubjectChoiceGroup {
  choice_group_id: number;
  subjects: ProgrammeSubjectResponse[];
}

export interface ProgrammeSubjectRequirements {
  compulsory_core: ProgrammeSubjectResponse[];
  optional_core_groups: SubjectChoiceGroup[];
  electives: ProgrammeSubjectResponse[];
}

export interface BulkUploadError {
  row_number: number;
  error_message: string;
  field: string | null;
}

export interface BulkUploadResponse {
  total_rows: number;
  successful: number;
  failed: number;
  errors: BulkUploadError[];
}

export interface ProgrammeBulkUploadError {
  row_number: number;
  error_message: string;
  field: string | null;
}

export interface ProgrammeBulkUploadResponse {
  total_rows: number;
  successful: number;
  failed: number;
  errors: ProgrammeBulkUploadError[];
}

// Subject types
export interface Subject {
  id: number;
  code: string;
  original_code: string | null;
  name: string;
  subject_type: "CORE" | "ELECTIVE";
  created_at: string;
  updated_at: string;
}

export interface SubjectListResponse {
  items: Subject[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SubjectBulkUploadError {
  row_number: number;
  error_message: string;
  field: string | null;
}

export interface SubjectBulkUploadResponse {
  total_rows: number;
  successful: number;
  failed: number;
  errors: SubjectBulkUploadError[];
}

// Photo Album types
export interface RegistrationCandidatePhoto {
  id: number;
  registration_candidate_id: number;
  file_name: string;
  mime_type: string;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface PhotoAlbumItem {
  candidate_id: number;
  candidate_name: string;
  registration_number: string;
  index_number: string | null;
  school_id: number | null;
  school_name: string | null;
  school_code: string | null;
  photo: RegistrationCandidatePhoto | null;
}

export interface PhotoAlbumResponse {
  items: PhotoAlbumItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PhotoBulkUploadError {
  filename: string;
  registration_number?: string | null;
  index_number?: string | null;
  error_message: string;
}

export interface PhotoBulkUploadResponse {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: PhotoBulkUploadError[];
}
