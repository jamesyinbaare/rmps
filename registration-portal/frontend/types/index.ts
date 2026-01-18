// TypeScript types matching backend schemas

export type Role =
  | "SystemAdmin"
  | "Director"
  | "DeputyDirector"
  | "PrincipalManager"
  | "SeniorManager"
  | "Manager"
  | "Staff"
  | "SchoolAdmin"
  | "SchoolStaff"
  | "PublicUser"
  | "APIUSER";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: Role;
  school_id: number | null;
  school_name?: string | null;
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
  email?: string | null;
  phone?: string | null;
  digital_address?: string | null;
  post_office_address?: string | null;
  is_private?: boolean | null;
  principal_name?: string | null;
  principal_email?: string | null;
  principal_phone?: string | null;
  profile_completed: boolean;
  created_at?: string;
  updated_at?: string;
  admin_count?: number;
  candidate_count?: number;
}

export interface SchoolDetail extends School {
  is_active: boolean;
  is_private_examination_center: boolean;
  profile_completed: boolean;
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

export interface ProgrammeSummary {
  id: number;
  code: string;
  name: string;
  total_candidates: number;
  completed_candidates: number;
}

export interface SchoolDashboardData {
  school: {
    id: number;
    code: string;
    name: string;
    is_active: boolean;
    profile_completed?: boolean;
  };
  active_user_count: number;
  max_active_users: number;
  total_candidates: number;
  candidates_by_status: Record<string, number>;
  total_exams: number;
  programmes_summary: ProgrammeSummary[];
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
  firstname: string;
  lastname: string;
  othername: string | null;
  name: string; // Computed property (read-only)
  fullname: string; // Computed property (read-only, same as name)
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
  disability: string | null;
  registration_type: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_digital_address: string | null;
  guardian_national_id: string | null;
  registration_status: "PENDING" | "APPROVED" | "REJECTED" | "DRAFT";
  registration_date: string;
  created_at: string;
  updated_at: string;
  exam?: RegistrationExam;
  subject_selections?: RegistrationSubjectSelection[];
}

export interface Invoice {
  id: number;
  invoice_number: string;
  amount: number;
  currency: string;
  status: "pending" | "paid" | "cancelled";
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
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
  exam_series: string | null;
  year: number;
  description: string | null;
  registration_period: ExamRegistrationPeriod;
  results_published: boolean;
  results_published_at: string | null;
  results_published_by_user_id: string | null;
  pricing_model_preference: string | null;
  has_index_numbers: boolean;
  candidate_count?: number | null;
  approved_candidates?: number | null;
  created_at: string;
  updated_at: string;
}

export interface ExamStatistics {
  total_candidates: number;
  approved_candidates: number;
  completion_percentage: number;
  schools_count: number;
  days_to_end: number | null;
}

export interface ActiveExam extends RegistrationExam {
  approved_candidates: number;
}

export interface RegistrationExamCreate {
  exam_id_main_system?: number | null;
  exam_type: string;
  exam_series?: string | null;
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

export interface AdminUserCreate {
  email: string;
  password: string;
  full_name: string;
  role: Role;
  school_id?: number | null;
}

export interface UserPasswordReset {
  new_password: string;
}

export interface UserUpdate {
  full_name?: string;
  is_active?: boolean;
}

export interface UserListFilters {
  page?: number;
  page_size?: number;
  role?: Role | null;
  is_active?: boolean | null;
  search?: string | null;
}

export interface UserListResponse {
  items: User[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface RegistrationCandidateCreate {
  firstname: string;
  lastname: string;
  othername?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  programme_code?: string | null;
  programme_id?: number | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  national_id?: string | null;
  disability?: string | null;
  registration_type?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_digital_address?: string | null;
  guardian_national_id?: string | null;
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
  field?: string | null;
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

// Pricing types
export interface ApplicationFeeResponse {
  id: number;
  exam_id: number | null;
  registration_type: string | null;
  fee: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApplicationFeeCreate {
  fee: number;
  currency?: string;
  is_active?: boolean;
  registration_type?: string | null;
}

export interface SubjectPricingResponse {
  id: number;
  subject_id: number;
  exam_id: number | null;
  registration_type: string | null;
  price: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  subject: Subject;
}

export interface SubjectPricingCreate {
  subject_id: number;
  price: number;
  currency?: string;
  is_active?: boolean;
  registration_type?: string | null;
}

export interface SubjectPricingBulkUpdate {
  pricing: SubjectPricingCreate[];
}

export interface TieredPricingResponse {
  id: number;
  exam_id: number | null;
  registration_type: string | null;
  min_subjects: number;
  max_subjects: number | null;
  price: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TieredPricingCreate {
  min_subjects: number;
  max_subjects: number | null;
  price: number;
  currency?: string;
  is_active?: boolean;
  registration_type?: string | null;
}

export interface TieredPricingBulkUpdate {
  pricing: TieredPricingCreate[];
}

export interface ProgrammePricingResponse {
  id: number;
  programme_id: number;
  exam_id: number | null;
  registration_type: string | null;
  price: number;
  currency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  programme: Programme;
}

export interface ProgrammePricingCreate {
  programme_id: number;
  price: number;
  currency?: string;
  is_active?: boolean;
  registration_type?: string | null;
}

export interface ProgrammePricingBulkUpdate {
  pricing: ProgrammePricingCreate[];
}

export interface ExamPricingModelResponse {
  id: number;
  exam_id: number | null;
  registration_type: string | null;
  pricing_model_preference: string;
  created_at: string;
  updated_at: string;
}

export interface ExamPricingModelCreate {
  registration_type?: string | null;
  pricing_model_preference: string;
}

export interface ExamPricingResponse {
  exam_id: number;
  application_fee: ApplicationFeeResponse | null;
  subject_pricing: SubjectPricingResponse[];
  tiered_pricing: TieredPricingResponse[];
  programme_pricing: ProgrammePricingResponse[];
  pricing_models: ExamPricingModelResponse[];
}

export interface ImportPricingRequest {
  source_exam_id: number;
  import_application_fee?: boolean;
  import_subject_pricing?: boolean;
  import_tiered_pricing?: boolean;
  import_programme_pricing?: boolean;
  import_pricing_models?: boolean;
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

// Results types
export type Grade =
  | "Fail"
  | "Pass"
  | "Lower Credit"
  | "Credit"
  | "Upper Credit"
  | "Distinction"
  | "Blocked"
  | "Cancelled"
  | "Absent";

export type ResultBlockType =
  | "CANDIDATE_ALL"
  | "CANDIDATE_SUBJECT"
  | "SCHOOL_ALL"
  | "SCHOOL_SUBJECT";

export interface CandidateResult {
  id: number;
  registration_candidate_id: number;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  registration_exam_id: number;
  exam_type: string;
  exam_series: string;
  exam_year: number;
  grade: Grade;
  is_published: boolean;
  published_at: string | null;
  published_by_user_id: string | null;
  candidate_name: string;
  candidate_index_number: string | null;
  candidate_registration_number: string;
  created_at: string;
  updated_at: string;
}

export interface CandidateResultBulkPublishItem {
  registration_number: string;
  index_number?: string | null;
  subject_code: string;
  grade: Grade;
}

export interface CandidateResultBulkPublish {
  exam_id: number;
  results: CandidateResultBulkPublishItem[];
}

export interface CandidateResultBulkPublishResponse {
  total_processed: number;
  successful: number;
  failed: number;
  errors: Array<{ row: string; error: string }>;
}

export interface ResultBlock {
  id: number;
  block_type: ResultBlockType;
  registration_exam_id: number;
  exam_type: string;
  exam_series: string;
  exam_year: number;
  registration_candidate_id: number | null;
  candidate_name: string | null;
  candidate_registration_number: string | null;
  school_id: number | null;
  school_name: string | null;
  school_code: string | null;
  subject_id: number | null;
  subject_code: string | null;
  subject_name: string | null;
  is_active: boolean;
  blocked_by_user_id: string;
  blocked_by_user_name: string;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResultBlockCreate {
  block_type: ResultBlockType;
  registration_exam_id: number;
  registration_candidate_id?: number | null;
  school_id?: number | null;
  subject_id?: number | null;
  reason?: string | null;
}

export interface PublicResultCheckRequest {
  index_number?: string | null;
  registration_number?: string | null;
  exam_type: string;
  exam_series: string;
  year: number;
}

export interface PublicSubjectResult {
  subject_code: string;
  subject_name?: string | null;
  grade: Grade | null;
}

export interface PublicResultResponse {
  candidate_name: string;
  index_number: string | null;
  registration_number: string;
  exam_type: string;
  exam_series: string;
  year: number;
  results: PublicSubjectResult[];
  exam_published: boolean;
  school_name?: string | null;
  school_code?: string | null;
  programme_name?: string | null;
  programme_code?: string | null;
  photo_url?: string | null;
}

// Index Number Generation Job types
export type IndexNumberGenerationJobStatus = "pending" | "processing" | "completed" | "failed";

export interface SchoolProgressItem {
  school_id: number;
  school_code: string;
  school_name: string;
  processed: number;
  total: number;
  status: IndexNumberGenerationJobStatus;
}

export interface IndexNumberGenerationJob {
  id: number;
  exam_id: number;
  status: IndexNumberGenerationJobStatus;
  replace_existing: boolean;
  progress_current: number;
  progress_total: number;
  current_school_id: number | null;
  current_school_name: string | null;
  school_progress: SchoolProgressItem[] | null;
  error_message: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface ExaminationSchedule {
  id: number;
  registration_exam_id: number;
  subject_code: string;
  subject_name: string;
  papers: Array<{ paper: number; date: string; start_time: string; end_time?: string }>;
  venue: string | null;
  duration_minutes: number | null;
  instructions: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExaminationScheduleCreate {
  original_code: string;
  papers: Array<{ paper: number; date: string; start_time: string; end_time?: string }>;
  venue?: string | null;
  duration_minutes?: number | null;
  instructions?: string | null;
}

export interface ExaminationScheduleBulkUploadError {
  row_number: number;
  error_message: string;
  field: string | null;
}

export interface ExaminationScheduleBulkUploadResponse {
  total_rows: number;
  successful: number;
  failed: number;
  errors: ExaminationScheduleBulkUploadError[];
}

export interface TimetableEntry {
  subject_code: string;
  subject_name: string;
  examination_date: string;
  examination_time: string;
  examination_end_time?: string | null;
  venue?: string | null;
  duration_minutes?: number | null;
  instructions?: string | null;
}

export interface TimetableResponse {
  exam_id: number;
  exam_type: string;
  exam_series: string;
  year: number;
  entries: TimetableEntry[];
}

export type TimetableDownloadFilter = "ALL" | "CORE_ONLY" | "ELECTIVE_ONLY";

export interface ExaminationScheduleUpdate {
  subject_code?: string;
  subject_name?: string;
  papers?: Array<{ paper: number; date: string; start_time: string; end_time?: string }>;
  venue?: string | null;
  duration_minutes?: number | null;
  instructions?: string | null;
}

// API Key types
export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
  rate_limit_per_minute: number;
  total_requests: number;
  total_verifications: number;
}

export interface ApiKeyCreate {
  name: string;
  rate_limit_per_minute?: number;
}

export interface ApiKeyCreateResponse {
  id: string;
  name: string;
  api_key: string; // Full key shown only once
  key_prefix: string;
  is_active: boolean;
  created_at: string;
  rate_limit_per_minute: number;
}

export interface ApiKeyUsageStats {
  total_requests: number;
  total_verifications: number;
  requests_today: number;
  requests_this_month: number;
  average_duration_ms: number | null;
  last_used_at: string | null;
}

// Credit types
export interface CreditBalance {
  balance: number;
  total_purchased: number;
  total_used: number;
}

export interface CreditPurchaseRequest {
  amount: number;
  payment_method?: string;
}

export interface CreditPurchaseResponse {
  payment_url: string | null;
  payment_reference: string | null;
  amount: number;
  credits: number;
  message: string;
}

export interface CreditTransaction {
  id: number;
  transaction_type: "purchase" | "admin_assignment" | "usage" | "refund";
  amount: number;
  balance_after: number;
  description: string | null;
  created_at: string;
}

export interface CreditTransactionListResponse {
  transactions: CreditTransaction[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

// Verification types
export interface BulkVerificationRequest {
  items: PublicResultCheckRequest[];
}

export interface VerificationItemResponse {
  success: boolean;
  request: PublicResultCheckRequest;
  result: PublicResultResponse | null;
  error: string | null;
}

export interface BulkVerificationResponse {
  total: number;
  successful: number;
  failed: number;
  results: VerificationItemResponse[];
}

// API User types (for admin management)
export interface ApiUser {
  id: string;
  email: string;
  full_name: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export interface ApiUserListItem extends ApiUser {
  credit_balance: number;
  total_api_keys: number;
  active_api_keys: number;
  total_requests: number;
  total_verifications: number;
}

export interface ApiUserListResponse {
  items: ApiUserListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiUserUsageStats {
  total_requests: number;
  total_verifications: number;
  requests_today: number;
  requests_this_week: number;
  requests_this_month: number;
  successful_requests: number;
  failed_requests: number;
  average_duration_ms: number | null;
  total_credits_used: number;
  credits_remaining: number;
}

export interface ApiUserDetail {
  user: ApiUser;
  credit_balance: CreditBalance;
  api_keys: ApiKey[];
  usage_stats: ApiUserUsageStats;
  created_at: string;
  last_activity: string | null;
}

// Photo Validation Job types
export interface PhotoValidationJobResponse {
  id: number;
  school_id: number;
  status: "pending" | "processing" | "completed" | "failed";
  validation_level: "basic" | "standard" | "strict";
  progress_current: number;
  progress_total: number;
  total_photos: number;
  valid_count: number;
  invalid_count: number;
  result_zip_path: string | null;
  validation_report: Record<string, any> | null;
  error_message: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}
