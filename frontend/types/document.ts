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

export type SchoolRegion =
  | "Ashanti Region"
  | "Bono Region"
  | "Bono East Region"
  | "Ahafo Region"
  | "Central Region"
  | "Eastern Region"
  | "Greater Accra Region"
  | "Northern Region"
  | "North East Region"
  | "Savannah Region"
  | "Upper East Region"
  | "Upper West Region"
  | "Volta Region"
  | "Oti Region"
  | "Western Region"
  | "Western North Region";

export type SchoolZone =
  | "A"
  | "B"
  | "C"
  | "D"
  | "E"
  | "F"
  | "G"
  | "H"
  | "I"
  | "J"
  | "K"
  | "L"
  | "M"
  | "N"
  | "O"
  | "P"
  | "Q"
  | "R"
  | "S"
  | "T"
  | "U"
  | "V"
  | "W"
  | "X"
  | "Y"
  | "Z";

export interface School {
  id: number;
  code: string;
  name: string;
  region: SchoolRegion;
  zone: SchoolZone;
  school_type: "private" | "public" | null;
  created_at: string;
  updated_at: string;
}

export interface Subject {
  id: number;
  code: string;
  name: string;
  subject_type: "CORE" | "ELECTIVE";
  created_at: string;
  updated_at: string;
}

export type ExamName = "Certificate II Examination" | "CBT";

export type ExamSeries = "MAY/JUNE" | "NOV/DEC";

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

export interface CandidateBulkUploadError {
  row_number: number;
  error_message: string;
  field: string | null;
}

export interface CandidateBulkUploadResponse {
  total_rows: number;
  successful: number;
  failed: number;
  errors: CandidateBulkUploadError[];
}

export interface SubjectScore {
  id: number;
  subject_registration_id: number;
  obj_raw_score: number | null;
  essay_raw_score: number;
  pract_raw_score: number | null;
  obj_normalized: number | null;
  essay_normalized: number | null;
  pract_normalized: number | null;
  total_score: number;
  document_id: string | null;
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

export interface ScoreResponse {
  id: number;
  subject_registration_id: number;
  obj_raw_score: number | null;
  essay_raw_score: number;
  pract_raw_score: number | null;
  obj_normalized: number | null;
  essay_normalized: number | null;
  pract_normalized: number | null;
  total_score: number;
  document_id: string | null;
  created_at: string;
  updated_at: string;
  candidate_id: number;
  candidate_name: string;
  candidate_index_number: string;
  subject_id: number;
  subject_code: string;
  subject_name: string;
}

export interface DocumentScoresResponse {
  document_id: string;
  scores: ScoreResponse[];
}

export interface ScoreUpdate {
  obj_raw_score?: number | null;
  essay_raw_score?: number | null;
  pract_raw_score?: number | null;
}

export interface BatchScoreUpdateItem {
  score_id?: number | null;
  subject_registration_id: number;
  obj_raw_score?: number | null;
  essay_raw_score?: number | null;
  pract_raw_score?: number | null;
}

export interface BatchScoreUpdate {
  scores: BatchScoreUpdateItem[];
}

export interface BatchScoreUpdateResponse {
  successful: number;
  failed: number;
  errors: Array<{ [key: string]: string }>;
}

export interface ScoreDocumentFilters {
  exam_id?: number;
  school_id?: number;
  subject_id?: number;
  test_type?: string;
  page?: number;
  page_size?: number;
}
