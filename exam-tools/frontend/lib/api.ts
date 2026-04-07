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

export type SchoolCreatePayload = {
  code: string;
  name: string;
  region: string;
  zone: string;
  school_type?: string | null;
  is_private_examination_center?: boolean;
  writes_at_center_id?: string | null;
};

export type SchoolUpdatePayload = {
  name?: string;
  region?: string;
  zone?: string;
  school_type?: string | null;
  is_private_examination_center?: boolean;
  writes_at_center_id?: string | null;
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
  candidate_count: number;
  school_count: number;
  upcoming: StaffCentreOverviewUpcomingItem[];
  /** All slots on today's date (centre timezone), including papers that already started. */
  sessions_today?: StaffCentreOverviewUpcomingItem[];
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
};

export type ScriptSeriesPackingResponse = {
  id: string;
  envelopes: ScriptEnvelopeItem[];
};

export type ScriptSeriesSlotResponse = {
  series_number: number;
  packing: ScriptSeriesPackingResponse | null;
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
  /** Maximum booklets allowed per envelope (from server config). */
  scripts_per_envelope: number;
  subjects: ScriptSubjectRowResponse[];
};

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
