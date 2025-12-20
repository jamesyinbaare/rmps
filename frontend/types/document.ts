export interface Document {
  id: number;
  file_path: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  checksum: string;
  uploaded_at: string;
  school_id: number | null;
  school_name: string | null; // School name from relationship
  subject_id: number | null;
  exam_id: number;
  test_type: string | null;
  subject_series: string | null;
  sheet_number: string | null;
  extracted_id: string | null; // The actual extracted ID value (13-character string)
  id_extraction_method: string | null; // How the ID was extracted (barcode, ocr, manual)
  id_extraction_confidence: number | null; // Confidence level (0.0 to 1.0)
  id_extraction_status: string; // Status: pending, success, error
  id_extracted_at: string | null; // When the ID was extracted
  scores_extraction_data: Record<string, any> | null; // Extracted scores/content as JSON
  scores_extraction_status: string | null; // Status: pending, success, error
  scores_extraction_method: string | null; // How scores were extracted (ocr, reducto, manual)
  scores_extraction_confidence: number | null; // Confidence level (0.0 to 1.0)
  scores_extracted_at: string | null; // When scores were extracted
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
  exam_type: string;
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

export type ExamType = "Certificate II Examination" | "CBT";

export type ExamSeries = "MAY/JUNE" | "NOV/DEC";

export interface DocumentFilters {
  exam_id?: number;
  exam_type?: ExamType;
  series?: ExamSeries;
  year?: number;
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
  exam_type: ExamType | null;
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

export interface SubjectScore {
  id: number;
  subject_registration_id: number;
  obj_raw_score: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  essay_raw_score: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  pract_raw_score: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  obj_normalized: number | null;
  essay_normalized: number | null;
  pract_normalized: number | null;
  total_score: number;
  obj_document_id: string | null;
  essay_document_id: string | null;
  pract_document_id: string | null;
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
  obj_raw_score: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  essay_raw_score: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  pract_raw_score: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  obj_normalized: number | null;
  essay_normalized: number | null;
  pract_normalized: number | null;
  total_score: number;
  obj_document_id: string | null;
  essay_document_id: string | null;
  pract_document_id: string | null;
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
  obj_raw_score?: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  essay_raw_score?: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  pract_raw_score?: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
}

export interface BatchScoreUpdateItem {
  score_id?: number | null;
  subject_registration_id: number;
  obj_raw_score?: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  essay_raw_score?: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
  pract_raw_score?: string | null; // Numeric string (>=0), "A"/"AA" (absent), or null (not entered)
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
  exam_type?: ExamType;
  series?: ExamSeries;
  year?: number;
  school_id?: number;
  subject_id?: number;
  test_type?: string;
  extraction_status?: string; // Filter by extraction status: pending, queued, processing, success, error
  page?: number;
  page_size?: number;
}

export interface ReductoQueueRequest {
  document_ids: number[];
}

export interface DocumentQueueStatus {
  document_id: number;
  queue_position: number | null;
  status: string;
}

export interface ReductoQueueResponse {
  queued_count: number;
  documents: DocumentQueueStatus[];
  queue_length: number;
}

export interface ReductoStatusResponse {
  document_id: number;
  scores_extraction_status: string | null;
  scores_extraction_method: string | null;
  scores_extraction_confidence: number | null;
  scores_extracted_at: string | null;
  queue_position: number | null;
}

export interface ManualEntryFilters {
  exam_id?: number;
  exam_type?: ExamType;
  series?: ExamSeries;
  year?: number;
  programme_id?: number;
  subject_id?: number;
  page?: number;
  page_size?: number;
}

export interface CandidateScoreEntry {
  candidate_id: number;
  candidate_name: string;
  candidate_index_number: string;
  subject_registration_id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  exam_id: number;
  exam_name: string;
  exam_year: number;
  exam_series: string;
  programme_id: number | null;
  programme_code: string | null;
  programme_name: string | null;
  score_id: number | null;
  obj_raw_score: string | null;
  essay_raw_score: string | null;
  pract_raw_score: string | null;
}

export interface CandidateScoreListResponse {
  items: CandidateScoreEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
