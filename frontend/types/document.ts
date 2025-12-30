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
  scores_extraction_methods: string[] | null; // Set of extraction methods used: AUTOMATED_EXTRACTION, MANUAL_TRANSCRIPTION_DIGITAL, MANUAL_ENTRY_PHYSICAL
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
  subjects_to_serialize: string[] | null;
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
  original_code: string;
  name: string;
  subject_type: "CORE" | "ELECTIVE";
  exam_type: ExamType;
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
  id_extraction_status?: string;
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
  active_photo: CandidatePhoto | null;
}

export interface CandidatePhoto {
  id: number;
  candidate_id: number;
  file_name: string;
  mime_type: string;
  is_active: boolean;
  uploaded_at: string;
  created_at: string;
  updated_at: string;
}

export interface CandidatePhotoListResponse {
  items: CandidatePhoto[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PhotoAlbumItem {
  candidate_id: number;
  candidate_name: string;
  index_number: string;
  school_id: number;
  school_name: string;
  school_code: string;
  photo: CandidatePhoto | null;
}

export interface PhotoAlbumResponse {
  items: PhotoAlbumItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface PhotoAlbumFilters {
  page?: number;
  page_size?: number;
  school_id?: number;
  exam_id?: number;
  programme_id?: number;
  has_photo?: boolean;
}

export interface PhotoBulkUploadError {
  filename: string;
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

export interface SchoolBulkUploadError {
  row_number: number;
  error_message: string;
  field: string | null;
}

export interface SchoolBulkUploadResponse {
  total_rows: number;
  successful: number;
  failed: number;
  errors: SchoolBulkUploadError[];
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
  grade: "Fail" | "Pass" | "Lower Credit" | "Credit" | "Upper Credit" | "Distinction" | null;
  created_at: string;
  updated_at: string;
}

export interface SubjectRegistration {
  id: number;
  exam_registration_id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_type: "CORE" | "ELECTIVE";
  series: number | null;
  created_at: string;
  updated_at: string;
  subject_score: SubjectScore | null;
  obj_max_score: number | null;
  essay_max_score: number | null;
  pract_max_score: number | null;
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
  extraction_method?: string; // Filter by extraction method: AUTOMATED_EXTRACTION, MANUAL_TRANSCRIPTION_DIGITAL, MANUAL_ENTRY_PHYSICAL
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
  scores_extraction_methods: string[] | null;
  scores_extraction_confidence: number | null;
  scores_extracted_at: string | null;
  queue_position: number | null;
}

export interface ManualEntryFilters {
  exam_id?: number;
  exam_type?: ExamType;
  series?: ExamSeries;
  year?: number;
  school_id?: number;
  programme_id?: number;
  subject_id?: number;
  document_id?: string;
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
  subject_series: number | null;
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
  obj_pct: number | null;
  essay_pct: number | null;
  pract_pct: number | null;
  obj_document_id: string | null;
  essay_document_id: string | null;
  pract_document_id: string | null;
}

export interface CandidateScoreListResponse {
  items: CandidateScoreEntry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ReductoDataResponse {
  data: Record<string, any>;
  status: string;
  confidence: number | null;
  extracted_at: string | null;
}

export interface UpdateScoresFromReductoResponse {
  updated_count: number;
  unmatched_count: number;
  unmatched_records: Array<{
    index_number: string | null;
    candidate_name: string | null;
    score: string | null;
    error?: string;
  }>;
  errors: Array<{ [key: string]: string }>;
}

export interface UnmatchedExtractionRecord {
  id: number;
  document_id: number;
  document_extracted_id: string | null;
  document_school_name: string | null;
  document_subject_name: string | null;
  index_number: string | null;
  candidate_name: string | null;
  score: string | null;
  sn: number | null;
  raw_data: Record<string, any> | null;
  status: string;
  extraction_method: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface UnmatchedRecordsListResponse {
  items: UnmatchedExtractionRecord[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ResolveUnmatchedRecordRequest {
  subject_registration_id: number;
  score_field: "obj" | "essay" | "pract";
  score_value: string | null;
}

export type ValidationIssueType = "missing_score" | "invalid_score";
export type ValidationIssueStatus = "pending" | "resolved" | "ignored";

export interface SubjectScoreValidationIssue {
  id: number;
  subject_score_id: number;
  exam_subject_id: number;
  issue_type: ValidationIssueType;
  field_name: string;
  test_type: number;
  message: string;
  status: ValidationIssueStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface ValidationIssueListResponse {
  total: number;
  page: number;
  page_size: number;
  issues: SubjectScoreValidationIssue[];
}

export interface RunValidationRequest {
  exam_id?: number | null;
  school_id?: number | null;
  subject_id?: number | null;
}

export interface RunValidationResponse {
  total_scores_checked: number;
  issues_found: number;
  issues_resolved: number;
  issues_created: number;
  message: string;
}

export interface ValidationIssuesFilters {
  exam_id?: number;
  school_id?: number;
  subject_id?: number;
  status?: ValidationIssueStatus;
  issue_type?: ValidationIssueType;
  test_type?: number;
  page?: number;
  page_size?: number;
}

export interface ValidationIssueDetailResponse {
  id: number;
  subject_score_id: number;
  exam_subject_id: number;
  issue_type: ValidationIssueType;
  field_name: string;
  test_type: number;
  message: string;
  status: ValidationIssueStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  candidate_id: number | null;
  candidate_name: string | null;
  candidate_index_number: string | null;
  subject_id: number | null;
  subject_code: string | null;
  subject_name: string | null;
  exam_id: number | null;
  exam_type: string | null;
  exam_year: number | null;
  exam_series: string | null;
  current_score_value: string | null;
  document_id: string | null;
  document_file_name: string | null;
  document_numeric_id: number | null;
  document_mime_type: string | null;
}

export interface RegistrationProgress {
  total_candidates: number;
  completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface SerializationProgress {
  total_candidates: number;
  candidates_serialized: number;
  total_schools: number;
  schools_serialized: number;
  completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
  last_serialized_at: string | null;
  schools_detail: Array<Record<string, any>>;
  subjects_detail: Array<Record<string, any>>;
}

export interface IcmPdfGenerationProgress {
  total_schools: number;
  schools_with_sheets: number;
  total_subjects: number;
  subjects_with_sheets: number;
  score_sheets_generated: number;
  pdfs_generated: number;
  excel_exports_generated: number;
  completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
  schools_detail: Array<Record<string, any>>;
  subjects_detail: Array<Record<string, any>>;
  excel_exports: Array<{
    process_type: string;
    file_path: string;
    file_name: string;
    file_size: number;
    generated_at: string | null;
  }>;
}

export interface PreparationsProgress {
  registration: RegistrationProgress;
  serialization: SerializationProgress;
  icm_pdf_generation: IcmPdfGenerationProgress;
  overall_completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface ScoreInterpretationProgress {
  total_subjects: number;
  subjects_configured: number;
  subjects_with_grade_ranges: number;
  completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface DocumentProcessingProgress {
  total_documents: number;
  documents_id_extracted_success: number;
  documents_id_extracted_error: number;
  documents_id_extracted_pending: number;
  documents_scores_extracted_success: number;
  documents_scores_extracted_error: number;
  documents_scores_extracted_pending: number;
  id_extraction_completion_percentage: number;
  scores_extraction_completion_percentage: number;
  overall_completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface ScoringDataEntryProgress {
  total_subject_registrations: number;
  registrations_with_scores: number;
  total_expected_score_entries: number;
  total_actual_score_entries: number;
  registrations_manual_entry: number;
  registrations_digital_transcription: number;
  registrations_automated_extraction: number;
  completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface ValidationIssuesProgress {
  unmatched_records_total: number;
  unmatched_records_pending: number;
  unmatched_records_resolved: number;
  validation_issues_total: number;
  validation_issues_pending: number;
  validation_issues_resolved: number;
  completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface ResultsProcessingProgress {
  total_subject_registrations: number;
  registrations_processed: number;
  registrations_pending: number;
  completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface ResultsProcessingOverallProgress {
  score_interpretation: ScoreInterpretationProgress;
  document_processing: DocumentProcessingProgress;
  scoring_data_entry: ScoringDataEntryProgress;
  validation_issues: ValidationIssuesProgress;
  results_processing: ResultsProcessingProgress;
  overall_completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface GradeRangesProgress {
  total_subjects: number;
  subjects_with_grade_ranges: number;
  completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface ResultsReleaseProgress {
  grade_ranges: GradeRangesProgress;
  overall_completion_percentage: number;
  status: "complete" | "in_progress" | "pending";
}

export interface ExamProgressResponse {
  exam_id: number;
  exam_type: string;
  exam_year: number;
  exam_series: string;
  preparations: PreparationsProgress;
  results_processing: ResultsProcessingOverallProgress;
  results_release: ResultsReleaseProgress;
  overall_completion_percentage: number;
  overall_status: "complete" | "in_progress" | "pending";
}
