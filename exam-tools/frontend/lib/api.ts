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
  school_name: string;
};

export type ExaminationCenterDetailResponse = {
  center: School;
  hosted_schools: School[];
  inspectors: InspectorSchoolRow[];
};

export type InspectorListResponse = {
  items: InspectorSchoolRow[];
  total: number;
};

export type InspectorCreatePayload = {
  school_code: string;
  phone_number: string;
  full_name: string;
};

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

export type SchoolCreatePayload = {
  code: string;
  name: string;
  region: string;
  zone: string;
  school_type?: string | null;
  is_private_examination_center?: boolean;
  writes_at_center_id?: string | null;
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
  school_code: string;
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

export async function getMyCenterProgrammes(filterSchoolId?: string | null): Promise<MyCenterProgrammesResponse> {
  const u = new URLSearchParams();
  if (filterSchoolId != null && filterSchoolId.trim() !== "") {
    u.set("school_id", filterSchoolId.trim());
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

export async function listExaminationCandidates(examId: number): Promise<ExaminationCandidate[]> {
  return apiJson<ExaminationCandidate[]>(`/examinations/${examId}/candidates`);
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
  /** Effective max booklets per envelope for paper 1. */
  scripts_per_envelope_paper_1: number;
  /** Effective max booklets per envelope for paper 2. */
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
): Promise<MySchoolScriptControlResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<MySchoolScriptControlResponse>(
    `/examinations/${examId}/script-control/my-school?${q}`,
  );
}

export async function upsertScriptSeries(
  examId: number,
  schoolId: string,
  payload: ScriptSeriesUpsertPayload,
): Promise<ScriptSeriesPackingResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<ScriptSeriesPackingResponse>(
    `/examinations/${examId}/script-control/my-school/series?${q}`,
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
  },
): Promise<void> {
  const q = new URLSearchParams({
    school_id: params.school_id.trim(),
    subject_id: String(params.subject_id),
    paper_number: String(params.paper_number),
    series_number: String(params.series_number),
  });
  await apiJson(`/examinations/${examId}/script-control/my-school/series?${q}`, {
    method: "DELETE",
  });
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
): Promise<MyCenterQuestionPaperControlResponse> {
  return apiJson<MyCenterQuestionPaperControlResponse>(
    `/examinations/${examId}/question-paper-control/my-center`,
  );
}

export async function upsertQuestionPaperSlot(
  examId: number,
  payload: QuestionPaperSlotUpsertPayload,
): Promise<QuestionPaperSlotUpsertResponse> {
  return apiJson<QuestionPaperSlotUpsertResponse>(
    `/examinations/${examId}/question-paper-control/my-center/slot`,
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
  created_at: string;
  updated_at: string;
};

export type ExaminerRow = {
  id: string;
  examination_id: number;
  name: string;
  examiner_type: ExaminerTypeApi;
  region: string | null;
  zone: string | null;
  subject_ids: number[];
  allowed_zones: string[];
  deviation_weight: number | null;
  created_at: string;
  updated_at: string;
  /** When allowed zones match a full region (API-derived). */
  prefill_region?: string | null;
  /** Single-zone scope or zone-within-region letter when inferrable. */
  prefill_zone?: string | null;
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
};

export type ExaminerCreatePayload = {
  name: string;
  examiner_type: ExaminerTypeApi;
  region?: string | null;
  zone?: string | null;
  subject_ids: number[];
  allowed_zones: string[];
  deviation_weight?: number | null;
  /** Required. Allowed zones are derived from schools in this region unless restrict_zone narrows to one. */
  allowed_region?: string | null;
  /** Optional zone letter within allowed_region. */
  restrict_zone?: string | null;
};

export type ExaminerUpdatePayload = {
  name?: string;
  examiner_type?: ExaminerTypeApi;
  region?: string | null;
  zone?: string | null;
  subject_ids?: number[];
  allowed_zones?: string[];
  deviation_weight?: number | null;
  allowed_region?: string | null;
  restrict_zone?: string | null;
};

export type ScriptsAllocationQuotaReplacePayload = {
  items: ScriptsAllocationQuotaItem[];
};

export type AllocationSolvePayload = {
  unassigned_penalty?: number;
  time_limit_sec?: number;
  allocation_scope?: "zone" | "region";
  fairness_weight?: number;
  enforce_single_series_per_examiner?: boolean;
  cross_marking_rules?: Record<string, string[]>;
  exclude_home_zone_or_region?: boolean;
};

export type AllocationExaminerRow = {
  allocation_id: string;
  examiner_id: string;
  examiner_name: string;
  examiner_type: ExaminerTypeApi;
  subject_ids: number[];
  region?: string | null;
  zone?: string | null;
  allowed_zones: string[];
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
