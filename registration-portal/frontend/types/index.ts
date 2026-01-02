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
  created_at?: string;
  updated_at?: string;
  admin_count?: number;
  candidate_count?: number;
}

export interface SchoolDetail extends School {
  is_active: boolean;
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
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  national_id: string | null;
  registration_status: "PENDING" | "APPROVED" | "REJECTED";
  registration_date: string;
  created_at: string;
  updated_at: string;
  exam?: RegistrationExam;
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
