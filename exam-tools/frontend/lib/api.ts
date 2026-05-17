import { getApiBaseUrl, getStoredToken, parseErrorMessage } from "@/lib/auth";

export type School = {
  id: string;
  code: string;
  name: string;
  region: string;
  zone: string;
  school_type: string | null;
  is_private_examination_center: boolean;
  writes_at_center_id: string | null;
  /** Host examination centre school code when this school writes elsewhere. */
  writes_at_center_code?: string | null;
  /** Present when school is assigned to a depot. */
  depot_id?: string | null;
  /** Depot code when the school has a depot (from API). */
  depot_code?: string | null;
  created_at: string;
  updated_at: string;
};

export type SchoolListResponse = {
  items: School[];
  total: number;
};

export type ExaminationCenterSummary = {
  school: School;
  hosted_school_count: number;
};

export type ExaminationCenterListResponse = {
  items: ExaminationCenterSummary[];
  total: number;
};

export type InspectorSchoolRow = {
  id: string;
  full_name: string;
  phone_number: string | null;
  school_code: string | null;
  school_name?: string | null;
  is_active: boolean;
};

export type InspectorUpdatePayload = {
  full_name?: string;
  phone_number?: string;
  is_active?: boolean;
};

export type InspectorListParams = {
  skip?: number;
  limit?: number;
  sort?: string;
  order?: "asc" | "desc";
  q?: string | null;
  is_active?: boolean | null;
};

export type ExaminationCenterDetailResponse = {
  center: School;
  hosted_schools: School[];
  inspectors: InspectorSchoolRow[];
  posted_inspectors: PostedInspectorAtCentreRow[];
};

export type PostedInspectorAtCentreRow = {
  posting_id: string;
  examination_id: number;
  inspector_user_id: string;
  inspector_full_name: string;
  inspector_phone: string | null;
  subject_scope: string;
};

export type InspectorListResponse = {
  items: InspectorSchoolRow[];
  total: number;
};

export type InspectorCreatePayload = {
  phone_number: string;
  full_name: string;
  password: string;
  /** When set with at least one of core/elective, create postings for this examination. */
  examination_id?: number | null;
  core?: string | null;
  elective?: string | null;
};

export async function listInspectors(params: InspectorListParams = {}): Promise<InspectorListResponse> {
  const q = new URLSearchParams();
  if (params.skip != null) q.set("skip", String(params.skip));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.sort) q.set("sort", params.sort);
  if (params.order) q.set("order", params.order);
  if (params.q?.trim()) q.set("q", params.q.trim());
  if (params.is_active != null) q.set("is_active", String(params.is_active));
  const s = q.toString();
  return apiJson<InspectorListResponse>(`/inspectors${s ? `?${s}` : ""}`);
}

export async function adminUpdateInspector(
  userId: string,
  payload: InspectorUpdatePayload,
): Promise<InspectorSchoolRow> {
  return apiJson<InspectorSchoolRow>(`/inspectors/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function adminResetInspectorPassword(userId: string, newPassword: string): Promise<void> {
  const res = await apiFetch(`/inspectors/${encodeURIComponent(userId)}/reset-password`, {
    method: "POST",
    body: JSON.stringify({ new_password: newPassword }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
}

export async function adminDeleteInspector(userId: string): Promise<void> {
  const res = await apiFetch(`/inspectors/${encodeURIComponent(userId)}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
}

export type TestAdminOfficerCreatePayload = {
  email: string;
  password: string;
  full_name: string;
};

export type TestAdminOfficerCreatedResponse = {
  id: string;
  full_name: string;
  email: string;
};

export async function createTestAdminOfficer(
  payload: TestAdminOfficerCreatePayload,
): Promise<TestAdminOfficerCreatedResponse> {
  return apiJson<TestAdminOfficerCreatedResponse>("/test-admin-officers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type FinanceOfficerCreatePayload = {
  email: string;
  password: string;
  full_name: string;
};

export type FinanceOfficerCreatedResponse = {
  id: string;
  full_name: string;
  email: string;
};

export async function createFinanceOfficer(
  payload: FinanceOfficerCreatePayload,
): Promise<FinanceOfficerCreatedResponse> {
  return apiJson<FinanceOfficerCreatedResponse>("/finance-officers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export type SchoolCreatePayload = {
  code: string;
  name: string;
  region: string;
  zone: string;
  school_type?: string | null;
  is_private_examination_center?: boolean;
  writes_at_center_id?: string | null;
  /** Host examination centre school code; do not send together with writes_at_center_id. */
  writes_at_center_code?: string | null;
  /** Existing depot code; omit or null for no depot. */
  depot_code?: string | null;
};

export type SchoolUpdatePayload = {
  name?: string;
  region?: string;
  zone?: string;
  school_type?: string | null;
  is_private_examination_center?: boolean;
  writes_at_center_id?: string | null;
  /** Host examination centre by school code; empty clears. Do not send together with writes_at_center_id. */
  writes_at_center_code?: string | null;
  depot_id?: string | null;
  /** Set or clear depot by code (null clears). */
  depot_code?: string | null;
};

export type SchoolCreatedResponse = {
  school: School;
  supervisor_full_name: string;
  supervisor_initial_password: string;
};

export type SchoolBulkUploadError = {
  row_number: number;
  error_message: string;
};

export type ProvisionedSupervisor = {
  row_number: number;
  school_code: string;
  supervisor_full_name: string;
  supervisor_initial_password: string;
};

export type SchoolBulkUploadResponse = {
  total_rows: number;
  successful: number;
  failed: number;
  errors: SchoolBulkUploadError[];
  provisioned_supervisors: ProvisionedSupervisor[];
};

export type InspectorBulkUploadError = {
  row_number: number;
  error_message: string;
};

export type InspectorBulkCreatedRow = {
  row_number: number;
  phone_number: string;
  full_name: string;
};

export type InspectorBulkUploadResponse = {
  total_rows: number;
  successful: number;
  failed: number;
  errors: InspectorBulkUploadError[];
  created: InspectorBulkCreatedRow[];
};

export type SubjectTypeEnum = "CORE" | "ELECTIVE";

export type Programme = {
  id: number;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type ProgrammeListResponse = {
  items: Programme[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

export type Subject = {
  id: number;
  code: string;
  original_code: string | null;
  name: string;
  subject_type: SubjectTypeEnum;
  created_at: string;
  updated_at: string;
};

export type SubjectListResponse = {
  items: Subject[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
};

/** Fetches every subject page until the list is exhausted. Page size must not exceed the API max (100). */
export async function listAllSubjects(pageSize = 100): Promise<Subject[]> {
  const all: Subject[] = [];
  let page = 1;
  while (page <= 1000) {
    const res = await apiJson<SubjectListResponse>(`/subjects?page=${page}&page_size=${pageSize}`);
    all.push(...res.items);
    if (res.items.length < pageSize) break;
    page += 1;
  }
  return all;
}

export type ProgrammeBulkUploadError = {
  row_number: number;
  error_message: string;
  field: string | null;
};

export type ProgrammeBulkUploadResponse = {
  total_rows: number;
  successful: number;
  failed: number;
  errors: ProgrammeBulkUploadError[];
};

export type SubjectBulkUploadError = {
  row_number: number;
  error_message: string;
  field: string | null;
};

export type SubjectBulkUploadResponse = {
  total_rows: number;
  successful: number;
  failed: number;
  errors: SubjectBulkUploadError[];
};

export type ProgrammeSubjectRow = {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_type: SubjectTypeEnum;
  is_compulsory: boolean | null;
  choice_group_id: number | null;
  created_at: string;
};

export type SubjectChoiceGroup = {
  choice_group_id: number;
  subjects: ProgrammeSubjectRow[];
};

export type ProgrammeSubjectRequirements = {
  compulsory_core: ProgrammeSubjectRow[];
  optional_core_groups: SubjectChoiceGroup[];
  electives: ProgrammeSubjectRow[];
};

export type ProgrammeSubjectAssociation = {
  programme_id: number;
  subject_id: number;
  subject_type: SubjectTypeEnum;
  is_compulsory: boolean | null;
  choice_group_id: number | null;
};

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");

  const headers = new Headers(init.headers);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (
    init.body !== undefined &&
    !(init.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
    });
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(
        "Network error: could not reach the API. Check that the backend is running, NEXT_PUBLIC_API_BASE_URL matches the server, and browser devtools Network tab for CORS or blocked requests.",
      );
    }
    throw e;
  }
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export async function downloadApiFile(path: string, filename: string): Promise<void> {
  const res = await apiFetch(path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type ExamDocument = {
  id: string;
  title: string;
  description: string | null;
  original_filename: string;
  size_bytes: number;
  created_at: string;
};

export type ExamDocumentListResponse = {
  items: ExamDocument[];
  total: number;
};

export async function listExamDocuments(): Promise<ExamDocumentListResponse> {
  return apiJson<ExamDocumentListResponse>("/documents");
}

export async function uploadExamDocument(
  title: string,
  description: string | null | undefined,
  file: File,
): Promise<ExamDocument> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("title", title);
  if (description != null && description !== "") {
    formData.append("description", description);
  }
  formData.append("file", file);

  const res = await fetch(`${getApiBaseUrl()}/documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as ExamDocument;
}

export async function deleteExamDocument(id: string): Promise<void> {
  await apiFetch(`/documents/${id}`, { method: "DELETE" });
}

export async function downloadExamDocument(doc: ExamDocument): Promise<void> {
  await downloadApiFile(`/documents/${doc.id}/file`, doc.original_filename);
}

/** Fetch file bytes for thumbnail preview. Caller must revoke blob URLs. */
export async function fetchExamDocumentBlob(documentId: string): Promise<Blob> {
  const res = await apiFetch(`/documents/${documentId}/file`);
  return res.blob();
}

export type TimetableDownloadFilter = "ALL" | "CORE_ONLY" | "ELECTIVE_ONLY";

export type Examination = {
  id: number;
  exam_type: string;
  exam_series: string | null;
  year: number;
  description: string | null;
  created_at: string;
  updated_at: string;
};

export type ExaminationSchedule = {
  id: number;
  examination_id: number;
  subject_code: string;
  subject_name: string;
  papers: Record<string, unknown>[];
  venue: string | null;
  duration_minutes: number | null;
  instructions: string | null;
  created_at: string;
  updated_at: string;
};

export type ExaminationScriptSeriesConfigRow = {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  series_count: number;
};

export type ExaminationScriptSeriesConfigResponse = {
  items: ExaminationScriptSeriesConfigRow[];
};

export async function getExaminationScriptSeriesConfig(
  examId: number,
): Promise<ExaminationScriptSeriesConfigResponse> {
  return apiJson<ExaminationScriptSeriesConfigResponse>(`/examinations/${examId}/script-series-config`);
}

export async function putExaminationScriptSeriesConfig(
  examId: number,
  payload: ExaminationScriptSeriesConfigResponse,
): Promise<ExaminationScriptSeriesConfigResponse> {
  return apiJson<ExaminationScriptSeriesConfigResponse>(`/examinations/${examId}/script-series-config`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type TimetableEntry = {
  subject_code: string;
  subject_name: string;
  paper: number;
  examination_date: string;
  examination_time: string;
  examination_end_time: string | null;
  venue: string | null;
  duration_minutes: number | null;
  instructions: string | null;
};

export type TimetablePreviewResponse = {
  examination_id: number;
  exam_type: string;
  exam_series: string | null;
  year: number;
  school_id: string | null;
  school_code: string | null;
  entries: TimetableEntry[];
};

export type CenterScopeSchoolItem = {
  id: string;
  code: string;
  name: string;
};

export type MyCenterSchoolsResponse = {
  center_school_id: string;
  schools: CenterScopeSchoolItem[];
};

/** Ghana bank branch directory (6-digit sort code). */
export type BankBranchRow = {
  id: string;
  bank_code: string;
  bank_name: string;
  branch_name: string;
  created_at: string;
  updated_at: string;
};

/** Show bank / sort codes as text (avoids numeric JSON being rendered without quotes). */
export function displayBankCode(code: string | number | null | undefined): string {
  if (code === null || code === undefined) return "";
  if (typeof code === "number" && Number.isFinite(code)) {
    return Number.isInteger(code) ? String(Math.trunc(code)) : String(code);
  }
  return String(code);
}

export type BankBranchListResponse = {
  items: BankBranchRow[];
  total: number;
};

export type BankBranchBulkUploadError = {
  row_number: number;
  error_message: string;
};

export type BankBranchBulkUploadResponse = {
  total_rows: number;
  successful: number;
  failed: number;
  errors: BankBranchBulkUploadError[];
  created: number;
  updated: number;
};

export type ListBankBranchesParams = {
  bank_name?: string | null;
  /** When set, only rows whose bank_name equals this string (exact). */
  bank_name_exact?: string | null;
  branch_name?: string | null;
  skip?: number;
  limit?: number;
};

export async function listBankBranches(params?: ListBankBranchesParams): Promise<BankBranchListResponse> {
  const q = new URLSearchParams();
  if (params?.bank_name_exact?.trim()) q.set("bank_name_exact", params.bank_name_exact.trim());
  else if (params?.bank_name?.trim()) q.set("bank_name", params.bank_name.trim());
  if (params?.branch_name?.trim()) q.set("branch_name", params.branch_name.trim());
  if (params?.skip != null) q.set("skip", String(params.skip));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return apiJson<BankBranchListResponse>(`/bank-branches${s ? `?${s}` : ""}`);
}

export async function getDistinctBankNames(q?: string | null): Promise<string[]> {
  const u = new URLSearchParams();
  if (q?.trim()) u.set("q", q.trim());
  const s = u.toString();
  return apiJson<string[]>(`/bank-branches/distinct-bank-names${s ? `?${s}` : ""}`);
}

export async function uploadBankBranchesBulk(file: File): Promise<BankBranchBulkUploadResponse> {
  const fd = new FormData();
  fd.append("file", file);
  return apiJson<BankBranchBulkUploadResponse>("/bank-branches/bulk-upload", {
    method: "POST",
    body: fd,
  });
}

export type CentreScopeProgrammeItem = {
  id: number;
  code: string;
  name: string;
  subject_count: number;
};

export type MyCenterProgrammesResponse = {
  programmes: CentreScopeProgrammeItem[];
};

export type MyDepotSchoolsResponse = {
  schools: CenterScopeSchoolItem[];
};

export async function getMyDepotSchools(): Promise<MyDepotSchoolsResponse> {
  return apiJson<MyDepotSchoolsResponse>("/examinations/timetable/my-depot-schools");
}

/** Default examination for staff dashboards (admin-selected, else env, else most recently created). */
export async function getStaffDefaultExamination(): Promise<Examination> {
  return apiJson<Examination>("/examinations/staff-default-examination");
}

export type ActiveExaminationAdminResponse = {
  active_examination_id: number | null;
  resolved_examination_id: number;
  examination: Examination;
};

export async function getAdminActiveExamination(): Promise<ActiveExaminationAdminResponse> {
  return apiJson<ActiveExaminationAdminResponse>("/admin/system/active-examination");
}

export async function putAdminActiveExamination(
  activeExaminationId: number | null,
): Promise<ActiveExaminationAdminResponse> {
  return apiJson<ActiveExaminationAdminResponse>("/admin/system/active-examination", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ active_examination_id: activeExaminationId }),
  });
}

export async function getMyDepotProgrammes(filterSchoolId?: string | null): Promise<MyCenterProgrammesResponse> {
  const u = new URLSearchParams();
  if (filterSchoolId != null && filterSchoolId.trim() !== "") {
    u.set("school_id", filterSchoolId.trim());
  }
  const s = u.toString();
  return apiJson<MyCenterProgrammesResponse>(
    `/examinations/timetable/my-depot-programmes${s ? `?${s}` : ""}`,
  );
}

export async function getMyCenterSchoolsForTimetable(
  examinationId?: number | null,
): Promise<MyCenterSchoolsResponse> {
  const u = new URLSearchParams();
  if (examinationId != null) u.set("examination_id", String(examinationId));
  const s = u.toString();
  return apiJson<MyCenterSchoolsResponse>(
    `/examinations/timetable/my-center-schools${s ? `?${s}` : ""}`,
  );
}

export async function getMyCenterProgrammes(
  filterSchoolId?: string | null,
  examinationId?: number | null,
): Promise<MyCenterProgrammesResponse> {
  const u = new URLSearchParams();
  if (filterSchoolId != null && filterSchoolId.trim() !== "") {
    u.set("school_id", filterSchoolId.trim());
  }
  if (examinationId != null) {
    u.set("examination_id", String(examinationId));
  }
  const s = u.toString();
  return apiJson<MyCenterProgrammesResponse>(
    `/examinations/timetable/my-center-programmes${s ? `?${s}` : ""}`,
  );
}

export type StaffCentreOverviewUpcomingItem = {
  subject_code: string;
  subject_name: string;
  paper: number;
  examination_date: string;
  examination_time: string;
};

export type StaffCentreOverviewResponse = {
  examination_id: number;
  exam_type: string;
  exam_series: string | null;
  year: number;
  supervisor_school_code: string;
  supervisor_school_name: string;
  examination_centre_host_school_id: string;
  examination_centre_host_code: string;
  examination_centre_host_name: string;
  supervisor_school_is_centre_host: boolean;
  candidate_count: number;
  school_count: number;
  upcoming: StaffCentreOverviewUpcomingItem[];
  /** All slots on today's date (centre timezone), including papers that already started. */
  sessions_today?: StaffCentreOverviewUpcomingItem[];
  examination_centre_region: string;
  /** ISO date (YYYY-MM-DD) or null when no candidate-linked timetable rows. */
  examination_window_start: string | null;
  examination_window_end: string | null;
  schools_with_candidate_counts: {
    school_id: string;
    school_code: string;
    school_name: string;
    candidate_count: number;
  }[];
  inspector_posted_workspaces?: InspectorPostedWorkspaceItem[] | null;
};

export type InspectorPostedWorkspaceItem = {
  posting_id: string;
  center_id: string;
  center_code: string;
  center_name: string;
  subject_scope: string;
};

export type MyInspectorPostingRow = {
  id: string;
  center_id: string;
  center_code: string;
  center_name: string;
  subject_scope: string;
};

export type MyInspectorPostingsResponse = {
  items: MyInspectorPostingRow[];
};

export type StaffCentreDaySummarySlotRow = {
  subject_code: string;
  subject_name: string;
  papers_label: string;
  times_label: string;
  counts_by_school: number[];
  row_total: number;
};

export type StaffCentreDaySummaryResponse = {
  examination_date: string;
  schools: CenterScopeSchoolItem[];
  slots: StaffCentreDaySummarySlotRow[];
  unique_candidates: number;
  invigilators_required: number;
};

export async function getStaffCentreOverview(examId: number): Promise<StaffCentreOverviewResponse> {
  return apiJson<StaffCentreOverviewResponse>(`/examinations/${examId}/my-center-overview`);
}

export async function getMyInspectorPostings(examId: number): Promise<MyInspectorPostingsResponse> {
  return apiJson<MyInspectorPostingsResponse>(`/examinations/${examId}/my-inspector-postings`);
}

/** Super-admin: inspector examination postings (Core/Elective per centre). */
export type ExamInspectorSubjectScopeApi = "ALL" | "CORE" | "ELECTIVE";

export type AdminInspectorExamPostingRow = {
  id: string;
  examination_id: number;
  inspector_user_id: string;
  inspector_full_name: string;
  inspector_phone_number: string | null;
  center_id: string;
  center_code: string;
  center_name: string;
  subject_scope: string;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AdminInspectorExamPostingListResponse = {
  items: AdminInspectorExamPostingRow[];
};

export async function adminListInspectorPostings(params: {
  examinationId: number;
  inspectorUserId?: string | null;
  centerId?: string | null;
}): Promise<AdminInspectorExamPostingListResponse> {
  const q = new URLSearchParams();
  if (params.inspectorUserId?.trim()) q.set("inspector_user_id", params.inspectorUserId.trim());
  if (params.centerId?.trim()) q.set("center_id", params.centerId.trim());
  const s = q.toString();
  return apiJson<AdminInspectorExamPostingListResponse>(
    `/admin/examinations/${params.examinationId}/inspector-postings${s ? `?${s}` : ""}`,
  );
}

export type AdminInspectorExamPostingCreatePayload = {
  inspector_user_id: string;
  center_id: string;
  subject_scope: ExamInspectorSubjectScopeApi;
  notes?: string | null;
};

export type AdminInspectorExamPostingUpdatePayload = {
  center_id?: string | null;
  subject_scope?: ExamInspectorSubjectScopeApi | null;
  notes?: string | null;
};

export async function adminCreateInspectorPosting(
  examinationId: number,
  payload: AdminInspectorExamPostingCreatePayload,
): Promise<AdminInspectorExamPostingRow> {
  return apiJson<AdminInspectorExamPostingRow>(
    `/admin/examinations/${examinationId}/inspector-postings`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function adminUpdateInspectorPosting(
  examinationId: number,
  postingId: string,
  payload: AdminInspectorExamPostingUpdatePayload,
): Promise<AdminInspectorExamPostingRow> {
  return apiJson<AdminInspectorExamPostingRow>(
    `/admin/examinations/${examinationId}/inspector-postings/${encodeURIComponent(postingId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function adminDeleteInspectorPosting(
  examinationId: number,
  postingId: string,
): Promise<void> {
  await apiJson(
    `/admin/examinations/${examinationId}/inspector-postings/${encodeURIComponent(postingId)}`,
    { method: "DELETE" },
  );
}

export type InspectorPostingBulkUploadError = {
  row_number: number;
  error_message: string;
};

export type InspectorPostingBulkCreatedInspectorRow = {
  row_number: number;
  phone_number: string;
  full_name: string;
};

export type InspectorPostingBulkCreatedPostingRow = {
  row_number: number;
  inspector_user_id: string;
  center_code: string;
  subject_scope: string;
};

export type InspectorPostingBulkUploadResponse = {
  total_rows: number;
  successful: number;
  failed: number;
  errors: InspectorPostingBulkUploadError[];
  created_inspectors: InspectorPostingBulkCreatedInspectorRow[];
  created_postings: InspectorPostingBulkCreatedPostingRow[];
};

export async function adminBulkUploadInspectorPostings(
  examinationId: number,
  file: File,
): Promise<InspectorPostingBulkUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  return apiJson<InspectorPostingBulkUploadResponse>(
    `/admin/examinations/${examinationId}/inspector-postings/bulk-upload`,
    { method: "POST", body },
  );
}

/** Excel (.xlsx) template for inspector postings bulk upload. */
export async function downloadInspectorPostingsBulkTemplate(examinationId: number): Promise<void> {
  await downloadApiFile(
    `/admin/examinations/${examinationId}/inspector-postings/bulk-upload/template`,
    "inspector_postings_bulk_template.xlsx",
  );
}

export async function getStaffCentreDaySummary(
  examId: number,
  examinationDateIso: string,
): Promise<StaffCentreDaySummaryResponse> {
  const q = new URLSearchParams({ examination_date: examinationDateIso });
  return apiJson<StaffCentreDaySummaryResponse>(
    `/examinations/${examId}/my-center-day-summary?${q.toString()}`,
  );
}

export async function getStaffNationalOverview(examId: number): Promise<StaffCentreOverviewResponse> {
  return apiJson<StaffCentreOverviewResponse>(`/examinations/${examId}/national-overview`);
}

export async function getStaffNationalDaySummary(
  examId: number,
  examinationDateIso: string,
): Promise<StaffCentreDaySummaryResponse> {
  const q = new URLSearchParams({ examination_date: examinationDateIso });
  return apiJson<StaffCentreDaySummaryResponse>(
    `/examinations/${examId}/national-day-summary?${q.toString()}`,
  );
}

export type StaffDepotOverviewResponse = {
  examination_id: number;
  exam_type: string;
  exam_series: string | null;
  year: number;
  depot_code: string;
  depot_name: string;
  candidate_count: number;
  school_count: number;
  upcoming: StaffCentreOverviewUpcomingItem[];
  sessions_today?: StaffCentreOverviewUpcomingItem[];
  /** Distinct subject codes on the candidate-linked timetable for this examination and depot. */
  timetable_distinct_subject_count: number;
  /** When all depot schools share one region; otherwise a multi-region label. */
  region_summary: string | null;
};

export async function getStaffDepotOverview(examId: number): Promise<StaffDepotOverviewResponse> {
  return apiJson<StaffDepotOverviewResponse>(`/examinations/${examId}/my-depot-overview`);
}

export async function getStaffDepotDaySummary(
  examId: number,
  examinationDateIso: string,
): Promise<StaffCentreDaySummaryResponse> {
  const q = new URLSearchParams({ examination_date: examinationDateIso });
  return apiJson<StaffCentreDaySummaryResponse>(
    `/examinations/${examId}/my-depot-day-summary?${q.toString()}`,
  );
}

export function timetableDownloadQuery(params: {
  subject_filter?: TimetableDownloadFilter;
  programme_id?: number | null;
  filter_school_id?: string | null;
  merge_by_date?: boolean;
  orientation?: "portrait" | "landscape";
}): string {
  const u = new URLSearchParams();
  if (params.subject_filter && params.subject_filter !== "ALL") {
    u.set("subject_filter", params.subject_filter);
  }
  if (params.programme_id != null && params.programme_id !== undefined && !Number.isNaN(params.programme_id)) {
    u.set("programme_id", String(params.programme_id));
  }
  if (params.filter_school_id != null && params.filter_school_id !== undefined && params.filter_school_id.trim() !== "") {
    u.set("filter_school_id", params.filter_school_id.trim());
  }
  if (params.merge_by_date) {
    u.set("merge_by_date", "true");
  }
  if (params.orientation === "landscape") {
    u.set("orientation", "landscape");
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

export type ExaminationScheduleBulkUploadError = {
  row_number: number;
  error_message: string;
  field: string | null;
};

export type ExaminationScheduleBulkUploadResponse = {
  total_rows: number;
  successful: number;
  failed: number;
  errors: ExaminationScheduleBulkUploadError[];
};

export async function downloadScheduleTemplate(
  examId: number,
  filename = "examination_timetable_template.xlsx",
): Promise<void> {
  await downloadApiFile(`/examinations/${examId}/schedules/template`, filename);
}

export async function bulkUploadExaminationSchedules(
  examId: number,
  file: File,
  overrideExisting: boolean,
): Promise<ExaminationScheduleBulkUploadResponse> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");

  const q = new URLSearchParams();
  if (overrideExisting) {
    q.set("override_existing", "true");
  }
  const qs = q.toString();
  const path = `/examinations/${examId}/schedules/bulk-upload${qs ? `?${qs}` : ""}`;

  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as ExaminationScheduleBulkUploadResponse;
}

export type ExaminationCandidateSubject = {
  id: number;
  subject_id: number | null;
  subject_code: string;
  subject_name: string;
  series: number | null;
  created_at: string;
  updated_at: string;
};

export type ExaminationCandidate = {
  id: number;
  examination_id: number;
  school_id: string | null;
  school_code: string | null;
  school_name: string | null;
  school_region: string | null;
  school_zone: string | null;
  programme_id: number | null;
  programme_code: string | null;
  registration_number: string;
  index_number: string | null;
  full_name: string;
  date_of_birth: string | null;
  registration_status: string | null;
  source_candidate_id: number | null;
  subject_selections: ExaminationCandidateSubject[];
  created_at: string;
  updated_at: string;
};

export type ExaminationCandidateImportError = {
  row_number: number;
  error_message: string;
  field: string | null;
};

export type ExaminationCandidateImportResponse = {
  total_rows: number;
  successful: number;
  failed: number;
  errors: ExaminationCandidateImportError[];
};

export type ExaminationCandidateListResponse = {
  items: ExaminationCandidate[];
  total: number;
  skip: number;
  limit: number;
};

export type ListExaminationCandidatesParams = {
  skip?: number;
  limit?: number;
  school_id?: string | null;
  school_q?: string | null;
  region?: string | null;
  zone?: string | null;
};

export async function listExaminationCandidates(
  examId: number,
  params: ListExaminationCandidatesParams = {},
): Promise<ExaminationCandidateListResponse> {
  const q = new URLSearchParams();
  q.set("skip", String(params.skip ?? 0));
  q.set("limit", String(params.limit ?? 50));
  if (params.school_id?.trim()) q.set("school_id", params.school_id.trim());
  if (params.school_q?.trim()) q.set("school_q", params.school_q.trim());
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.zone?.trim()) q.set("zone", params.zone.trim());
  return apiJson<ExaminationCandidateListResponse>(`/examinations/${examId}/candidates?${q.toString()}`);
}

export async function downloadExaminationCandidatesTemplate(
  examId: number,
  filename = "candidates_template.xlsx",
): Promise<void> {
  await downloadApiFile(`/examinations/${examId}/candidates/import-template`, filename);
}

export async function importExaminationCandidates(
  examId: number,
  file: File,
): Promise<ExaminationCandidateImportResponse> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${getApiBaseUrl()}/examinations/${examId}/candidates/import`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as ExaminationCandidateImportResponse;
}

export type ScriptEnvelopeItem = {
  envelope_number: number;
  booklet_count: number;
  /** Present in API responses after depot keeper verification. */
  verified?: boolean;
};

export type ScriptSeriesPackingResponse = {
  id: string;
  envelopes: ScriptEnvelopeItem[];
  verified?: boolean;
};

export type ScriptSeriesSlotResponse = {
  series_number: number;
  packing: ScriptSeriesPackingResponse | null;
  verified?: boolean;
};

export type ScriptPaperSlotResponse = {
  paper_number: number;
  /** ISO date YYYY-MM-DD from timetable, if present */
  examination_date: string | null;
  series: ScriptSeriesSlotResponse[];
};

export type ScriptSubjectRowResponse = {
  subject_id: number;
  subject_code: string;
  subject_original_code?: string | null;
  subject_name: string;
  papers: ScriptPaperSlotResponse[];
};

export type MySchoolScriptControlResponse = {
  examination_id: number;
  exam_type: string;
  exam_series: string | null;
  year: number;
  school_id: string;
  school_code: string;
  /** Maximum for papers other than 1 and 2; default when paper-specific caps match this. */
  scripts_per_envelope: number;
  /** Effective max scannables per envelope for paper 1. */
  scripts_per_envelope_paper_1: number;
  /** Effective max answer booklets per envelope for paper 2. */
  scripts_per_envelope_paper_2: number;
  subjects: ScriptSubjectRowResponse[];
};

/** Super-admin list of script packing rows (one API row per subject/paper/series). */
export type ScriptControlSubjectSeriesCountRow = {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  series_count: number;
};

export type ScriptControlAdminRow = {
  packing_series_id: string;
  examination_id: number;
  school_id: string;
  school_code: string;
  school_name: string;
  region: string;
  zone: string;
  subject_id: number;
  subject_code: string;
  subject_original_code?: string | null;
  subject_name: string;
  paper_number: number;
  series_number: number;
  envelope_count: number;
  total_booklets: number;
  envelopes: ScriptEnvelopeItem[];
};

export type ScriptControlAdminListResponse = {
  items: ScriptControlAdminRow[];
  total: number;
  subject_series_counts: ScriptControlSubjectSeriesCountRow[];
  /** Keys `{examination_id}:{school_uuid}:{subject_id}` → distinct registered candidate count. */
  registered_candidates_by_school_subject?: Record<string, number>;
};

export type ScriptControlAdminRecordsParams = {
  examination_id?: number;
  school_id?: string;
  subject_id?: number;
  paper_number?: number;
  region?: string;
  zone?: string;
  school_q?: string;
  subject_q?: string;
  skip?: number;
  limit?: number;
};

export async function getScriptControlAdminRecords(
  params: ScriptControlAdminRecordsParams,
): Promise<ScriptControlAdminListResponse> {
  const q = new URLSearchParams();
  if (params.examination_id != null) q.set("examination_id", String(params.examination_id));
  if (params.school_id?.trim()) q.set("school_id", params.school_id.trim());
  if (params.subject_id != null) q.set("subject_id", String(params.subject_id));
  if (params.paper_number != null) q.set("paper_number", String(params.paper_number));
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.zone?.trim()) q.set("zone", params.zone.trim());
  if (params.school_q?.trim()) q.set("school_q", params.school_q.trim());
  if (params.subject_q?.trim()) q.set("subject_q", params.subject_q.trim());
  q.set("skip", String(params.skip ?? 0));
  q.set("limit", String(params.limit ?? 500));
  return apiJson<ScriptControlAdminListResponse>(`/script-control/records?${q}`);
}

export async function getIrregularScriptControlAdminRecords(
  params: ScriptControlAdminRecordsParams,
): Promise<ScriptControlAdminListResponse> {
  const q = new URLSearchParams();
  if (params.examination_id != null) q.set("examination_id", String(params.examination_id));
  if (params.school_id?.trim()) q.set("school_id", params.school_id.trim());
  if (params.subject_id != null) q.set("subject_id", String(params.subject_id));
  if (params.paper_number != null) q.set("paper_number", String(params.paper_number));
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.zone?.trim()) q.set("zone", params.zone.trim());
  if (params.school_q?.trim()) q.set("school_q", params.school_q.trim());
  if (params.subject_q?.trim()) q.set("subject_q", params.subject_q.trim());
  q.set("skip", String(params.skip ?? 0));
  q.set("limit", String(params.limit ?? 500));
  return apiJson<ScriptControlAdminListResponse>(`/irregular-script-control/records?${q}`);
}

export type ScriptControlExportParams = {
  mode: "summary" | "detail";
  examination_id: number;
  subject_id: number;
  paper_number: number;
  school_id?: string;
  region?: string;
  zone?: string;
  school_q?: string;
  subject_q?: string;
};

/** Excel export for admin worked-scripts view (same filters as getScriptControlAdminRecords, without pagination). */
export async function downloadScriptControlExport(
  params: ScriptControlExportParams,
  filename: string,
): Promise<void> {
  const q = new URLSearchParams();
  q.set("mode", params.mode);
  q.set("examination_id", String(params.examination_id));
  q.set("subject_id", String(params.subject_id));
  q.set("paper_number", String(params.paper_number));
  if (params.school_id?.trim()) q.set("school_id", params.school_id.trim());
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.zone?.trim()) q.set("zone", params.zone.trim());
  if (params.school_q?.trim()) q.set("school_q", params.school_q.trim());
  if (params.subject_q?.trim()) q.set("subject_q", params.subject_q.trim());
  await downloadApiFile(`/script-control/export?${q}`, filename);
}

export async function downloadIrregularScriptControlExport(
  params: ScriptControlExportParams,
  filename: string,
): Promise<void> {
  const q = new URLSearchParams();
  q.set("mode", params.mode);
  q.set("examination_id", String(params.examination_id));
  q.set("subject_id", String(params.subject_id));
  q.set("paper_number", String(params.paper_number));
  if (params.school_id?.trim()) q.set("school_id", params.school_id.trim());
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.zone?.trim()) q.set("zone", params.zone.trim());
  if (params.school_q?.trim()) q.set("school_q", params.school_q.trim());
  if (params.subject_q?.trim()) q.set("subject_q", params.subject_q.trim());
  await downloadApiFile(`/irregular-script-control/export?${q}`, filename);
}

export type ScriptSeriesUpsertPayload = {
  subject_id: number;
  paper_number: number;
  series_number: number;
  envelopes: ScriptEnvelopeItem[];
};

/** ``schoolId`` must be a school in the inspector's examination centre (see ``/examinations/timetable/my-center-schools``). */
export async function getMySchoolScriptControl(
  examId: number,
  schoolId: string,
  postingId?: string | null,
): Promise<MySchoolScriptControlResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  if (postingId?.trim()) q.set("posting_id", postingId.trim());
  return apiJson<MySchoolScriptControlResponse>(
    `/examinations/${examId}/script-control/my-school?${q}`,
  );
}

/** Inspector irregular worked scripts for one school in centre scope. */
export async function getMySchoolIrregularScriptControl(
  examId: number,
  schoolId: string,
  postingId?: string | null,
): Promise<MySchoolScriptControlResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  if (postingId?.trim()) q.set("posting_id", postingId.trim());
  return apiJson<MySchoolScriptControlResponse>(
    `/examinations/${examId}/irregular-script-control/my-school?${q}`,
  );
}

export async function upsertScriptSeries(
  examId: number,
  schoolId: string,
  payload: ScriptSeriesUpsertPayload,
  postingId?: string | null,
): Promise<ScriptSeriesPackingResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  if (postingId?.trim()) q.set("posting_id", postingId.trim());
  return apiJson<ScriptSeriesPackingResponse>(
    `/examinations/${examId}/script-control/my-school/series?${q}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function upsertIrregularScriptSeries(
  examId: number,
  schoolId: string,
  payload: ScriptSeriesUpsertPayload,
  postingId?: string | null,
): Promise<ScriptSeriesPackingResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  if (postingId?.trim()) q.set("posting_id", postingId.trim());
  return apiJson<ScriptSeriesPackingResponse>(
    `/examinations/${examId}/irregular-script-control/my-school/series?${q}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteScriptSeries(
  examId: number,
  params: {
    school_id: string;
    subject_id: number;
    paper_number: number;
    series_number: number;
    posting_id?: string | null;
  },
): Promise<void> {
  const q = new URLSearchParams({
    school_id: params.school_id.trim(),
    subject_id: String(params.subject_id),
    paper_number: String(params.paper_number),
    series_number: String(params.series_number),
  });
  if (params.posting_id?.trim()) q.set("posting_id", params.posting_id.trim());
  await apiJson(`/examinations/${examId}/script-control/my-school/series?${q}`, {
    method: "DELETE",
  });
}

export async function deleteIrregularScriptSeries(
  examId: number,
  params: {
    school_id: string;
    subject_id: number;
    paper_number: number;
    series_number: number;
    posting_id?: string | null;
  },
): Promise<void> {
  const q = new URLSearchParams({
    school_id: params.school_id.trim(),
    subject_id: String(params.subject_id),
    paper_number: String(params.paper_number),
    series_number: String(params.series_number),
  });
  if (params.posting_id?.trim()) q.set("posting_id", params.posting_id.trim());
  await apiJson(`/examinations/${examId}/irregular-script-control/my-school/series?${q}`, {
    method: "DELETE",
  });
}

export type ExamOfficialDesignation =
  | "Depot Keeper"
  | "Supervisor"
  | "Assistant Supervisor"
  | "Invigilator"
  | "Police Officer"
  | "External Inspector";

export type ExamCentreOfficialResponse = {
  id: string;
  examination_id: number;
  center_id: string;
  full_name: string;
  designation: ExamOfficialDesignation;
  bank_branch_id: string;
  bank_code: string;
  bank_name: string;
  branch_name: string;
  account_number: string;
  num_days: number;
  telephone_number: string;
  created_at: string;
  updated_at: string;
};

export type ExamCentreOfficialListResponse = {
  items: ExamCentreOfficialResponse[];
};

export type ExamCentreOfficialCreatePayload = {
  full_name: string;
  designation: ExamOfficialDesignation;
  bank_branch_id: string;
  account_number: string;
  num_days: number;
  telephone_number: string;
};

export type ExamCentreOfficialUpdatePayload = {
  full_name?: string;
  designation?: ExamOfficialDesignation;
  bank_branch_id?: string;
  account_number?: string;
  num_days?: number;
  telephone_number?: string;
};

export async function getExamOfficialsForMyCentre(
  examId: number,
  postingId?: string | null,
): Promise<ExamCentreOfficialListResponse> {
  const u = new URLSearchParams();
  if (postingId?.trim()) u.set("posting_id", postingId.trim());
  const s = u.toString();
  return apiJson<ExamCentreOfficialListResponse>(
    `/examinations/${examId}/exam-officials/my-centre${s ? `?${s}` : ""}`,
  );
}

export async function createExamOfficial(
  examId: number,
  payload: ExamCentreOfficialCreatePayload,
  postingId?: string | null,
): Promise<ExamCentreOfficialResponse> {
  const u = new URLSearchParams();
  if (postingId?.trim()) u.set("posting_id", postingId.trim());
  const s = u.toString();
  return apiJson<ExamCentreOfficialResponse>(
    `/examinations/${examId}/exam-officials/my-centre${s ? `?${s}` : ""}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function updateExamOfficial(
  examId: number,
  officialId: string,
  payload: ExamCentreOfficialUpdatePayload,
  postingId?: string | null,
): Promise<ExamCentreOfficialResponse> {
  const u = new URLSearchParams();
  if (postingId?.trim()) u.set("posting_id", postingId.trim());
  const s = u.toString();
  return apiJson<ExamCentreOfficialResponse>(
    `/examinations/${examId}/exam-officials/my-centre/${officialId.trim()}${s ? `?${s}` : ""}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteExamOfficial(
  examId: number,
  officialId: string,
  postingId?: string | null,
): Promise<void> {
  const u = new URLSearchParams();
  if (postingId?.trim()) u.set("posting_id", postingId.trim());
  const s = u.toString();
  await apiJson(`/examinations/${examId}/exam-officials/my-centre/${officialId.trim()}${s ? `?${s}` : ""}`, {
    method: "DELETE",
  });
}

export type AdminExamCentreOfficialRow = {
  id: string;
  examination_id: number;
  examination_label: string;
  center_id: string;
  center_code: string;
  center_name: string;
  full_name: string;
  designation: string;
  bank_branch_id: string;
  bank_code: string;
  bank_name: string;
  branch_name: string;
  account_number: string;
  num_days: number;
  telephone_number: string;
  created_at: string;
  updated_at: string;
};

export type AdminExamCentreOfficialListResponse = {
  items: AdminExamCentreOfficialRow[];
  total: number;
};

export async function listAdminExamCentreOfficials(params: {
  examination_id: number;
  center_id?: string | null;
  designation?: string | null;
  skip?: number;
  limit?: number;
}): Promise<AdminExamCentreOfficialListResponse> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  if (params.center_id) q.set("center_id", params.center_id.trim());
  if (params.designation?.trim()) q.set("designation", params.designation.trim());
  if (params.skip != null) q.set("skip", String(params.skip));
  if (params.limit != null) q.set("limit", String(params.limit));
  return apiJson<AdminExamCentreOfficialListResponse>(`/admin/exam-centre-officials?${q.toString()}`);
}

export async function downloadAdminExamCentreOfficialsExport(params: {
  examination_id: number;
  layout: "zip" | "combined";
  center_id?: string | null;
  designation?: string | null;
  filename: string;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  q.set("layout", params.layout);
  if (params.center_id) q.set("center_id", params.center_id.trim());
  if (params.designation?.trim()) q.set("designation", params.designation.trim());
  await downloadApiFile(`/admin/exam-centre-officials/export?${q.toString()}`, params.filename);
}

export type FinanceCentreDayInvigilatorRow = {
  examination_date: string;
  unique_candidates: number;
  invigilators_required: number;
};

export type FinanceCentreInvigilatorSummaryItem = {
  center_id: string;
  center_code: string;
  center_name: string;
  days: FinanceCentreDayInvigilatorRow[];
};

export type FinanceCentreInvigilatorSummaryResponse = {
  examination_id: number;
  centres: FinanceCentreInvigilatorSummaryItem[];
};

export type TimetableSubjectFilter = "ALL" | "CORE_ONLY" | "ELECTIVE_ONLY";

export type FinanceCentreInvigilatorSummaryShellResponse = {
  examination_id: number;
  examination_dates: string[];
  centres: { center_id: string; center_code: string; center_name: string }[];
};

function financeSummaryQuery(subject_filter?: TimetableSubjectFilter): string {
  const q = new URLSearchParams();
  if (subject_filter != null) q.set("subject_filter", subject_filter);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function getFinanceCentreInvigilatorSummaryShell(params: {
  examId: number;
  subject_filter?: TimetableSubjectFilter;
}): Promise<FinanceCentreInvigilatorSummaryShellResponse> {
  return apiJson<FinanceCentreInvigilatorSummaryShellResponse>(
    `/examinations/${params.examId}/finance/centre-invigilator-summary/shell${financeSummaryQuery(params.subject_filter)}`,
  );
}

export async function getFinanceCentreInvigilatorSummaryForCentre(params: {
  examId: number;
  center_host_id: string;
  subject_filter?: TimetableSubjectFilter;
}): Promise<FinanceCentreInvigilatorSummaryItem> {
  return apiJson<FinanceCentreInvigilatorSummaryItem>(
    `/examinations/${params.examId}/finance/centre-invigilator-summary/centres/${params.center_host_id}${financeSummaryQuery(params.subject_filter)}`,
  );
}

export async function getFinanceCentreInvigilatorSummary(params: {
  examId: number;
  center_host_id?: string | null;
  subject_filter?: TimetableSubjectFilter;
}): Promise<FinanceCentreInvigilatorSummaryResponse> {
  const q = new URLSearchParams();
  if (params.center_host_id?.trim()) q.set("center_host_id", params.center_host_id.trim());
  if (params.subject_filter != null) q.set("subject_filter", params.subject_filter);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return apiJson<FinanceCentreInvigilatorSummaryResponse>(
    `/examinations/${params.examId}/finance/centre-invigilator-summary${suffix}`,
  );
}

const FINANCE_CENTRE_FETCH_CONCURRENCY = 5;

/** Load shell first, then fetch each centre’s day counts with limited parallelism. */
export async function loadFinanceCentreInvigilatorSummaryProgressive(
  params: {
    examId: number;
    subject_filter?: TimetableSubjectFilter;
  },
  onCentreLoaded: (centre: FinanceCentreInvigilatorSummaryItem) => void,
  onShellLoaded?: (shell: FinanceCentreInvigilatorSummaryShellResponse) => void,
): Promise<FinanceCentreInvigilatorSummaryShellResponse> {
  const shell = await getFinanceCentreInvigilatorSummaryShell(params);
  onShellLoaded?.(shell);

  let index = 0;
  async function worker() {
    while (index < shell.centres.length) {
      const i = index++;
      const c = shell.centres[i]!;
      const item = await getFinanceCentreInvigilatorSummaryForCentre({
        examId: params.examId,
        center_host_id: c.center_id,
        subject_filter: params.subject_filter,
      });
      onCentreLoaded(item);
    }
  }
  const workers = Array.from(
    { length: Math.min(FINANCE_CENTRE_FETCH_CONCURRENCY, shell.centres.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return shell;
}

export type QuestionPaperSeriesSlotResponse = {
  series_number: number;
  copies_received: number;
  copies_used: number;
  copies_to_library: number;
  copies_remaining: number;
  verified?: boolean;
};

export type QuestionPaperPaperSlotResponse = {
  paper_number: number;
  examination_date: string | null;
  series: QuestionPaperSeriesSlotResponse[];
};

export type QuestionPaperSubjectRowResponse = {
  subject_id: number;
  subject_code: string;
  /** Timetable / original code when different from ``subject_code``. */
  subject_original_code?: string | null;
  subject_name: string;
  papers: QuestionPaperPaperSlotResponse[];
};

export type MyCenterQuestionPaperControlResponse = {
  examination_id: number;
  exam_type: string;
  exam_series: string | null;
  year: number;
  center_id: string;
  center_code: string;
  center_name: string;
  subjects: QuestionPaperSubjectRowResponse[];
};

export type QuestionPaperSlotUpsertPayload = {
  subject_id: number;
  paper_number: number;
  series_number: number;
  copies_received: number;
  copies_used: number;
  copies_to_library: number;
  copies_remaining: number;
};

export type QuestionPaperSlotUpsertResponse = {
  id: string;
  subject_id: number;
  paper_number: number;
  series_number: number;
  copies_received: number;
  copies_used: number;
  copies_to_library: number;
  copies_remaining: number;
  verified?: boolean;
};

export type DepotSchoolRow = {
  id: string;
  code: string;
  name: string;
};

export type DepotSchoolListResponse = {
  items: DepotSchoolRow[];
};

export async function getMyCenterQuestionPaperControl(
  examId: number,
  postingId?: string | null,
): Promise<MyCenterQuestionPaperControlResponse> {
  const u = new URLSearchParams();
  if (postingId?.trim()) u.set("posting_id", postingId.trim());
  const s = u.toString();
  return apiJson<MyCenterQuestionPaperControlResponse>(
    `/examinations/${examId}/question-paper-control/my-center${s ? `?${s}` : ""}`,
  );
}

export async function upsertQuestionPaperSlot(
  examId: number,
  payload: QuestionPaperSlotUpsertPayload,
  postingId?: string | null,
): Promise<QuestionPaperSlotUpsertResponse> {
  const u = new URLSearchParams();
  if (postingId?.trim()) u.set("posting_id", postingId.trim());
  const s = u.toString();
  return apiJson<QuestionPaperSlotUpsertResponse>(
    `/examinations/${examId}/question-paper-control/my-center/slot${s ? `?${s}` : ""}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function getDepotSchools(): Promise<DepotSchoolListResponse> {
  return apiJson<DepotSchoolListResponse>("/depot-keeper/schools");
}

export async function getDepotCenters(): Promise<DepotSchoolListResponse> {
  return apiJson<DepotSchoolListResponse>("/depot-keeper/centers");
}

export async function getDepotSchoolScriptControl(
  examId: number,
  schoolId: string,
): Promise<MySchoolScriptControlResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<MySchoolScriptControlResponse>(
    `/examinations/${examId}/script-control/depot/school?${q}`,
  );
}

export async function getDepotSchoolIrregularScriptControl(
  examId: number,
  schoolId: string,
): Promise<MySchoolScriptControlResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<MySchoolScriptControlResponse>(
    `/examinations/${examId}/irregular-script-control/depot/school?${q}`,
  );
}

/** Script packing: subject / paper / series / envelope. */
export type ScriptControlSlotKeyPayload = {
  subject_id: number;
  paper_number: number;
  series_number: number;
  envelope_number: number;
};

/** Question paper control depot verify (no envelope). */
export type QuestionPaperSlotVerifyPayload = {
  subject_id: number;
  paper_number: number;
  series_number: number;
};

export type ScriptControlEnvelopeVerificationTogglePayload = ScriptControlSlotKeyPayload & {
  verified: boolean;
};

export async function setDepotScriptEnvelopeVerification(
  examId: number,
  schoolId: string,
  payload: ScriptControlEnvelopeVerificationTogglePayload,
): Promise<ScriptSeriesPackingResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<ScriptSeriesPackingResponse>(
    `/examinations/${examId}/script-control/depot/school/series/verification?${q}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function setDepotIrregularScriptEnvelopeVerification(
  examId: number,
  schoolId: string,
  payload: ScriptControlEnvelopeVerificationTogglePayload,
): Promise<ScriptSeriesPackingResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<ScriptSeriesPackingResponse>(
    `/examinations/${examId}/irregular-script-control/depot/school/series/verification?${q}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function getDepotCenterQuestionPaperControl(
  examId: number,
  centerId: string,
): Promise<MyCenterQuestionPaperControlResponse> {
  const q = new URLSearchParams({ center_id: centerId.trim() });
  return apiJson<MyCenterQuestionPaperControlResponse>(
    `/examinations/${examId}/question-paper-control/depot/center?${q}`,
  );
}

export async function verifyDepotQuestionPaperSlot(
  examId: number,
  centerId: string,
  payload: QuestionPaperSlotVerifyPayload,
): Promise<QuestionPaperSlotUpsertResponse> {
  const q = new URLSearchParams({ center_id: centerId.trim() });
  return apiJson<QuestionPaperSlotUpsertResponse>(
    `/examinations/${examId}/question-paper-control/depot/center/slot/verify?${q}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

/** Super-admin depot registry (`/depots`). */
export type AdminDepotRow = {
  id: string;
  code: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type AdminDepotListResponse = {
  items: AdminDepotRow[];
  total: number;
};

export type AdminDepotCreatePayload = {
  code: string;
  name: string;
};

export type AdminDepotUpdatePayload = {
  name: string;
};

export type AdminDepotKeeperRow = {
  id: string;
  full_name: string;
  username: string | null;
  depot_code: string;
  depot_name: string;
};

export type AdminDepotKeeperListResponse = {
  items: AdminDepotKeeperRow[];
  total: number;
};

export type AdminDepotKeeperCreatePayload = {
  depot_code: string;
  username: string;
  password: string;
  full_name: string;
};

export type AdminDepotKeeperCreatedResponse = {
  id: string;
  full_name: string;
  username: string;
  depot_code: string;
};

export async function adminListDepots(
  skip: number,
  limit: number,
): Promise<AdminDepotListResponse> {
  return apiJson<AdminDepotListResponse>(`/depots?skip=${skip}&limit=${limit}`);
}

export async function adminCreateDepot(payload: AdminDepotCreatePayload): Promise<AdminDepotRow> {
  return apiJson<AdminDepotRow>("/depots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function adminUpdateDepot(
  depotId: string,
  payload: AdminDepotUpdatePayload,
): Promise<AdminDepotRow> {
  return apiJson<AdminDepotRow>(`/depots/${depotId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function adminListDepotKeepers(
  skip: number,
  limit: number,
): Promise<AdminDepotKeeperListResponse> {
  return apiJson<AdminDepotKeeperListResponse>(`/depots/keepers?skip=${skip}&limit=${limit}`);
}

export async function adminCreateDepotKeeper(
  payload: AdminDepotKeeperCreatePayload,
): Promise<AdminDepotKeeperCreatedResponse> {
  return apiJson<AdminDepotKeeperCreatedResponse>("/depots/keepers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export type ExaminerTypeApi = "chief_examiner" | "assistant_examiner" | "team_leader";

export type AllocationRunStatusApi = "draft" | "optimal" | "infeasible" | "timeout" | "error";

export type AllocationSolveModeApi = "monolithic" | "decomposed";

export type AllocationSubgroupStatusApi =
  | "optimal"
  | "stopped_feasible"
  | "skipped_empty"
  | "infeasible"
  | "timeout"
  | "error";

export type AllocationSubgroupItemApi = {
  marking_group_id: string;
  series_number: number;
  status: AllocationSubgroupStatusApi;
  examiner_count: number;
  envelope_count: number;
  eligible_pair_count: number;
  objective_value: number | null;
  message: string | null;
  /** HiGHS time limit (seconds) for this subgroup when present. */
  time_limit_allocated_sec?: number | null;
};

export type Allocation = {
  id: string;
  examination_id: number;
  name: string;
  subject_id: number;
  paper_number: number;
  notes: string | null;
  allocation_scope: "zone" | "region";
  cross_marking_rules: Record<string, string[]>;
  fairness_weight: number;
  enforce_single_series_per_examiner: boolean;
  exclude_home_zone_or_region: boolean;
  /** Persisted solver strategy; default monolithic when absent (legacy API). */
  solve_mode?: AllocationSolveModeApi | null;
  enable_post_rebalance?: boolean;
  rebalance_tolerance_booklets?: number;
  created_at: string;
  updated_at: string;
};

export type ExaminerRow = {
  id: string;
  examination_id: number;
  name: string;
  examiner_type: ExaminerTypeApi;
  region: string;
  subject_ids: number[];
  deviation_weight: number | null;
  examiner_group_id: string | null;
  created_at: string;
  updated_at: string;
};

export type ExaminerGroupRow = {
  id: string;
  examination_id: number;
  name: string;
  examiner_ids: string[];
  source_regions: string[];
  created_at: string;
  updated_at: string;
};

export type ScriptsAllocationQuotaRow = {
  allocation_id: string;
  examiner_type: ExaminerTypeApi;
  subject_id: number;
  quota_booklets: number;
  created_at: string;
  updated_at: string;
};

export type ScriptsAllocationQuotaItem = {
  examiner_type: ExaminerTypeApi;
  subject_id: number;
  quota_booklets: number;
};

export type AllocationRunListItem = {
  id: string;
  allocation_id: string;
  status: AllocationRunStatusApi;
  objective_value: number | null;
  solver_message: string | null;
  created_at: string;
};

export type ExaminerSubjectRunSummary = {
  examiner_id: string;
  examiner_name: string;
  examiner_type: ExaminerTypeApi;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  quota_booklets: number | null;
  assigned_booklets: number;
  deviation: number | null;
};

export type AllocationAssignmentItem = {
  script_envelope_id: string;
  examiner_id: string;
  booklet_count: number;
  school_code: string;
  school_name: string;
  zone: string;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  paper_number: number;
  series_number: number;
  envelope_number: number;
};

export type UnassignedEnvelopeItem = Omit<AllocationAssignmentItem, "examiner_id"> & {
  /** School region (added for filtering; may be absent on stale clients). */
  region?: string;
};

export type AllocationRunDetail = {
  id: string;
  allocation_id: string;
  status: AllocationRunStatusApi;
  objective_value: number | null;
  solver_message: string | null;
  created_at: string;
  examiner_subject_summaries: ExaminerSubjectRunSummary[];
  assignments: AllocationAssignmentItem[];
  unassigned_envelope_ids: string[];
  unassigned_envelopes: UnassignedEnvelopeItem[];
  solve_mode?: AllocationSolveModeApi | null;
  subgroups?: AllocationSubgroupItemApi[];
};

export type AllocationRunAssignmentUpsertPayload = {
  script_envelope_id: string;
  examiner_id: string;
};

export type AllocationCreatePayload = {
  examination_id: number;
  name?: string | null;
  subject_id: number;
  paper_number: number;
  notes?: string | null;
};

export type AllocationUpdatePayload = {
  name?: string;
  subject_id?: number;
  paper_number?: number;
  notes?: string | null;
  allocation_scope?: "zone" | "region";
  cross_marking_rules?: Record<string, string[]>;
  fairness_weight?: number;
  enforce_single_series_per_examiner?: boolean;
  exclude_home_zone_or_region?: boolean;
  solve_mode?: AllocationSolveModeApi;
  enable_post_rebalance?: boolean;
  rebalance_tolerance_booklets?: number;
};

export type ExaminerCreatePayload = {
  name: string;
  examiner_type: ExaminerTypeApi;
  region: string;
  subject_ids: number[];
  deviation_weight?: number | null;
};

export type ExaminerUpdatePayload = {
  name?: string;
  examiner_type?: ExaminerTypeApi;
  region?: string;
  subject_ids?: number[];
  deviation_weight?: number | null;
};

export type ScriptsAllocationQuotaReplacePayload = {
  items: ScriptsAllocationQuotaItem[];
};

/** @deprecated Legacy UI mode; use `solve_mode` on the API instead. */
export type SourcePartitioningMode = "auto" | "monolithic" | "sequential";

export type AllocationSolvePayload = {
  unassigned_penalty?: number;
  time_limit_sec?: number;
  allocation_scope?: "zone" | "region";
  fairness_weight?: number;
  /** Secondary term to reduce distinct schools per examiner per MILP (e.g. 1e-3–1e-2). Default 0. */
  school_cohesion_weight?: number;
  /** Tiny tie-break to prefer larger booklet envelopes when main objective is tied (e.g. 1e-6). */
  prefer_larger_booklets_epsilon?: number;
  /** Optional second pass to rebalance over-quota allocations after MILP solve. */
  enable_post_rebalance?: boolean;
  /** Quota tolerance band for post-rebalance targeting (quota ± tolerance). Default 20. */
  rebalance_tolerance_booklets?: number;
  enforce_single_series_per_examiner?: boolean;
  /** Omit to use rules already saved on the allocation (recommended after Save solver settings). */
  cross_marking_rules?: Record<string, string[]> | null;
  exclude_home_zone_or_region?: boolean;
  /** Default monolithic (single MILP). Decomposed: sequential marking groups + series buckets (see marking_group_solve_order). */
  solve_mode?: AllocationSolveModeApi;
  /**
   * Marking group UUID order for decomposed solves (early groups claim envelopes first).
   * Omitted groups append in sorted UUID order. Use mapping table top-to-bottom order from the UI.
   */
  marking_group_solve_order?: string[] | null;
};

export type AllocationExaminerRow = {
  allocation_id: string;
  examiner_id: string;
  examiner_name: string;
  examiner_type: ExaminerTypeApi;
  subject_ids: number[];
  region: string;
  examiner_group_id: string | null;
  created_at: string;
};

export async function listAllocations(
  examinationId?: number,
  subjectId?: number,
  paperNumber?: number,
): Promise<Allocation[]> {
  const params = new URLSearchParams();
  if (examinationId != null) params.set("examination_id", String(examinationId));
  if (subjectId != null) params.set("subject_id", String(subjectId));
  if (paperNumber != null) params.set("paper_number", String(paperNumber));
  const q = params.toString();
  return apiJson<Allocation[]>(q ? `/allocations?${q}` : "/allocations");
}

export async function getAllocation(allocationId: string): Promise<Allocation> {
  return apiJson<Allocation>(`/allocations/${allocationId}`);
}

export async function ensureAllocation(payload: AllocationCreatePayload): Promise<Allocation> {
  return apiJson<Allocation>("/allocations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** @deprecated Use ensureAllocation — POST is upsert (200). */
export async function createAllocation(payload: AllocationCreatePayload): Promise<Allocation> {
  return ensureAllocation(payload);
}

export async function updateAllocation(
  allocationId: string,
  payload: AllocationUpdatePayload,
): Promise<Allocation> {
  return apiJson<Allocation>(`/allocations/${allocationId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteAllocation(allocationId: string): Promise<void> {
  await apiJson(`/allocations/${allocationId}`, { method: "DELETE" });
}

export async function listExaminationExaminers(examinationId: number): Promise<ExaminerRow[]> {
  return apiJson<ExaminerRow[]>(`/examinations/${examinationId}/examiners`);
}

export async function listScriptsAllocationQuotas(
  allocationId: string,
): Promise<ScriptsAllocationQuotaRow[]> {
  return apiJson<ScriptsAllocationQuotaRow[]>(`/allocations/${allocationId}/scripts-allocation-quotas`);
}

export async function replaceScriptsAllocationQuotas(
  allocationId: string,
  payload: ScriptsAllocationQuotaReplacePayload,
): Promise<ScriptsAllocationQuotaRow[]> {
  return apiJson<ScriptsAllocationQuotaRow[]>(`/allocations/${allocationId}/scripts-allocation-quotas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function createExaminationExaminer(
  examinationId: number,
  payload: ExaminerCreatePayload,
): Promise<ExaminerRow> {
  return apiJson<ExaminerRow>(`/examinations/${examinationId}/examiners`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateExaminationExaminer(
  examinationId: number,
  examinerId: string,
  payload: ExaminerUpdatePayload,
): Promise<ExaminerRow> {
  return apiJson<ExaminerRow>(`/examinations/${examinationId}/examiners/${examinerId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteExaminationExaminer(examinationId: number, examinerId: string): Promise<void> {
  await apiJson(`/examinations/${examinationId}/examiners/${examinerId}`, { method: "DELETE" });
}

export async function listExaminerGroups(examinationId: number): Promise<ExaminerGroupRow[]> {
  return apiJson<ExaminerGroupRow[]>(`/examinations/${examinationId}/examiner-groups`);
}

export async function createExaminerGroup(
  examinationId: number,
  payload: { name: string; source_regions?: string[] },
): Promise<ExaminerGroupRow> {
  return apiJson<ExaminerGroupRow>(`/examinations/${examinationId}/examiner-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      source_regions: payload.source_regions ?? [],
    }),
  });
}

export async function updateExaminerGroup(
  examinationId: number,
  groupId: string,
  payload: { name: string },
): Promise<ExaminerGroupRow> {
  return apiJson<ExaminerGroupRow>(`/examinations/${examinationId}/examiner-groups/${groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteExaminerGroup(examinationId: number, groupId: string): Promise<void> {
  await apiJson(`/examinations/${examinationId}/examiner-groups/${groupId}`, { method: "DELETE" });
}

export async function replaceExaminerGroupMembers(
  examinationId: number,
  groupId: string,
  examinerIds: string[],
): Promise<ExaminerGroupRow> {
  return apiJson<ExaminerGroupRow>(
    `/examinations/${examinationId}/examiner-groups/${groupId}/members`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ examiner_ids: examinerIds }),
    },
  );
}

export async function replaceExaminerGroupSourceRegions(
  examinationId: number,
  groupId: string,
  regions: string[],
): Promise<ExaminerGroupRow> {
  return apiJson<ExaminerGroupRow>(
    `/examinations/${examinationId}/examiner-groups/${groupId}/source-regions`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ regions }),
    },
  );
}

export async function listAllocationRuns(allocationId: string): Promise<AllocationRunListItem[]> {
  return apiJson<AllocationRunListItem[]>(`/allocations/${allocationId}/runs`);
}

export async function solveAllocation(
  allocationId: string,
  payload?: AllocationSolvePayload,
): Promise<AllocationRunDetail> {
  return apiJson<AllocationRunDetail>(`/allocations/${allocationId}/solve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });
}

export async function listAllocationExaminers(allocationId: string): Promise<AllocationExaminerRow[]> {
  return apiJson<AllocationExaminerRow[]>(`/allocations/${allocationId}/examiners`);
}

export async function listAllocationExaminerImportCandidates(
  allocationId: string,
): Promise<AllocationExaminerRow[]> {
  return apiJson<AllocationExaminerRow[]>(`/allocations/${allocationId}/examiner-import-candidates`);
}

export async function importAllocationExaminers(
  allocationId: string,
  examinerIds: string[],
): Promise<AllocationExaminerRow[]> {
  return apiJson<AllocationExaminerRow[]>(`/allocations/${allocationId}/examiners/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ examiner_ids: examinerIds }),
  });
}

export async function removeAllocationExaminer(allocationId: string, examinerId: string): Promise<void> {
  await apiJson(`/allocations/${allocationId}/examiners/${examinerId}`, { method: "DELETE" });
}

export async function getAllocationRun(runId: string): Promise<AllocationRunDetail> {
  return apiJson<AllocationRunDetail>(`/allocation-runs/${runId}`);
}

export async function upsertAllocationRunAssignment(
  runId: string,
  payload: AllocationRunAssignmentUpsertPayload,
): Promise<AllocationRunDetail> {
  return apiJson<AllocationRunDetail>(`/allocation-runs/${runId}/assignments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script_envelope_id: payload.script_envelope_id,
      examiner_id: payload.examiner_id,
    }),
  });
}

export async function deleteAllocationRunAssignment(
  runId: string,
  scriptEnvelopeId: string,
): Promise<AllocationRunDetail> {
  return apiJson<AllocationRunDetail>(`/allocation-runs/${runId}/assignments/${scriptEnvelopeId}`, {
    method: "DELETE",
  });
}

/** Max copies per examiner for scripts allocation form PDF (must match backend `MAX_COPIES`). */
export const SCRIPTS_ALLOCATION_FORM_MAX_COPIES = 20;

export async function downloadScriptsAllocationFormPdf(
  runId: string,
  options: { examinerId: string | null; copies: number },
  filename: string,
): Promise<void> {
  const params = new URLSearchParams();
  if (options.examinerId) {
    params.set("examiner_id", options.examinerId);
  }
  if (options.copies !== 1) {
    params.set("copies", String(options.copies));
  }
  const qs = params.toString();
  const path = `/allocation-runs/${encodeURIComponent(runId)}/scripts-allocation-form.pdf${qs ? `?${qs}` : ""}`;
  await downloadApiFile(path, filename);
}
