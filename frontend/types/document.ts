export interface Document {
  id: number;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  checksum: string;
  uploaded_at: string;
  school_id: number | null;
  subject_id: number | null;
  exam_id: number;
  test_type: string | null;
  subject_series: string | null;
  sheet_number: string | null;
  extracted_id: string | null;
  extraction_method: string | null;
  extraction_confidence: number | null;
  status: string;
}

export interface DocumentListResponse {
  items: Document[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface BulkUploadResponse {
  total: number;
  successful: number;
  failed: number;
  skipped: number;
  document_ids: number[];
}

export interface Exam {
  id: number;
  name: string;
  description: string | null;
  year: number;
  series: string;
  number_of_series: number;
  created_at: string;
  updated_at: string;
}

export interface ExamListResponse {
  items: Exam[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface School {
  id: number;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: number;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface DocumentFilters {
  exam_id?: number;
  school_id?: number;
  subject_id?: number;
  page?: number;
  page_size?: number;
}

export interface ApiError {
  detail: string;
}

export interface Programme {
  id: number;
  name: string;
  code: string;
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

export interface Candidate {
  id: number;
  school_id: number;
  programme_id: number | null;
  name: string;
  index_number: string;
  date_of_birth: string | null;
  gender: string | null;
  created_at: string;
  updated_at: string;
}

export interface CandidateListResponse {
  items: Candidate[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface SubjectScore {
  id: number;
  subject_registration_id: number;
  mcq_raw_score: number;
  essay_raw_score: number;
  practical_raw_score: number | null;
  total_score: number;
  created_at: string;
  updated_at: string;
}

export interface SubjectRegistration {
  id: number;
  exam_registration_id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  series: number | null;
  created_at: string;
  updated_at: string;
  subject_score: SubjectScore | null;
}

export interface ExamRegistration {
  id: number;
  candidate_id: number;
  exam_id: number;
  exam_name: string;
  exam_year: number;
  exam_series: string;
  created_at: string;
  updated_at: string;
}
