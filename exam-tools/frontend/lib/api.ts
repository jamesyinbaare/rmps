import {
  apiNetworkErrorMessage,
  getApiBaseUrl,
  getStoredToken,
  parseErrorMessage,
  throwIfUnauthorized,
} from "@/lib/auth";

async function assertAuthedResponse(res: Response): Promise<void> {
  throwIfUnauthorized(res);
  if (!res.ok) throw new Error(await parseErrorMessage(res));
}

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

export type CentreLocationSourceApi = "INSPECTOR_GPS" | "ADMIN_MANUAL";

export type CentreLocation = {
  centre_code: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  source: CentreLocationSourceApi;
  captured_at: string;
  captured_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

export type CentreLocationUpdatePayload = {
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
};

/** Per-examination centre (first-class entity; ``center_id`` in postings is this id). */
export type PerExamCentreItem = {
  id: string;
  examination_id: number;
  code: string;
  name: string;
  region: string | null;
  zone: string | null;
  hosted_school_count: number;
  has_location: boolean;
  location: CentreLocation | null;
  created_at: string;
  updated_at: string;
};

export type PerExamCentreListResponse = {
  items: PerExamCentreItem[];
  total: number;
  centre_structure_mode: "UNIFIED" | "SPLIT";
};

export type ListExaminationCentresOptions = {
  q?: string;
  subject_filter?: TimetableSubjectFilter;
};

export async function listExaminationCentres(
  examinationId: number,
  options?: string | ListExaminationCentresOptions,
): Promise<PerExamCentreListResponse> {
  const opts: ListExaminationCentresOptions =
    typeof options === "string" ? { q: options } : (options ?? {});
  const params = new URLSearchParams();
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  if (opts.subject_filter && opts.subject_filter !== "ALL") {
    params.set("subject_filter", opts.subject_filter);
  }
  const qs = params.toString();
  return apiJson<PerExamCentreListResponse>(
    `/examinations/${examinationId}/centres${qs ? `?${qs}` : ""}`,
  );
}

export async function upgradeExaminationCentresToSplit(
  examinationId: number,
): Promise<{ examination_id: number; centre_structure_mode: string; memberships_created: number; memberships_removed: number }> {
  return apiJson(`/examinations/${examinationId}/centres/upgrade-to-split`, {
    method: "POST",
  });
}

export type PerExamCentreMembership = {
  school_id: string;
  school_code: string;
  school_name: string;
  subject_scope: "ALL" | "CORE" | "ELECTIVE";
};

export type PerExamCentreDetailResponse = {
  centre: PerExamCentreItem;
  memberships: PerExamCentreMembership[];
  posted_inspectors: PostedInspectorAtCentreRow[];
  posted_inspector_posting_count?: number;
};

export async function getExaminationCentreDetail(
  examinationId: number,
  centreId: string,
): Promise<PerExamCentreDetailResponse> {
  return apiJson<PerExamCentreDetailResponse>(
    `/examinations/${examinationId}/centres/${encodeURIComponent(centreId)}`,
  );
}

export async function getExaminationCentreLocation(
  examinationId: number,
  centreId: string,
): Promise<CentreLocation> {
  return apiJson<CentreLocation>(
    `/examinations/${examinationId}/centres/${encodeURIComponent(centreId)}/location`,
  );
}

export async function upsertExaminationCentreLocation(
  examinationId: number,
  centreId: string,
  body: CentreLocationUpdatePayload,
  options?: { replace?: boolean },
): Promise<CentreLocation> {
  const qs = options?.replace ? "?replace=true" : "";
  return apiJson<CentreLocation>(
    `/examinations/${examinationId}/centres/${encodeURIComponent(centreId)}/location${qs}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export type CentreLocationListResponse = {
  items: CentreLocation[];
  total: number;
};

export async function listCentreLocations(
  offset = 0,
  limit = 2000,
): Promise<CentreLocationListResponse> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  return apiJson<CentreLocationListResponse>(`/centre-locations?${params}`);
}

export async function upsertCentreLocationByCode(
  centreCode: string,
  body: CentreLocationUpdatePayload,
): Promise<CentreLocation> {
  return apiJson<CentreLocation>(
    `/centre-locations/${encodeURIComponent(centreCode.trim().toUpperCase())}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export async function deleteCentreLocationByCode(centreCode: string): Promise<void> {
  const res = await apiFetch(
    `/centre-locations/${encodeURIComponent(centreCode.trim().toUpperCase())}`,
    { method: "DELETE" },
  );
  await assertAuthedResponse(res);
}

/** Download CSV of all centre locations (admin route planning export). */
export async function downloadCentreLocationsCsv(): Promise<Blob> {
  const res = await apiFetch("/centre-locations/export.csv");
  await assertAuthedResponse(res);
  return res.blob();
}

export type PerExamCentreCreatePayload = {
  code: string;
  name: string;
  region?: string | null;
  zone?: string | null;
};

export type PerExamCentreUpdatePayload = {
  code?: string;
  name?: string;
  region?: string | null;
  zone?: string | null;
};

export type PerExamCentreMembershipAssign = {
  school_code: string;
  subject_scope: "ALL" | "CORE" | "ELECTIVE";
};

export async function createExaminationCentre(
  examinationId: number,
  body: PerExamCentreCreatePayload,
): Promise<PerExamCentreItem> {
  return apiJson<PerExamCentreItem>(`/examinations/${examinationId}/centres`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateExaminationCentre(
  examinationId: number,
  centreId: string,
  body: PerExamCentreUpdatePayload,
): Promise<PerExamCentreItem> {
  return apiJson<PerExamCentreItem>(
    `/examinations/${examinationId}/centres/${encodeURIComponent(centreId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function deleteExaminationCentre(
  examinationId: number,
  centreId: string,
): Promise<void> {
  const res = await apiFetch(
    `/examinations/${examinationId}/centres/${encodeURIComponent(centreId)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const detail =
      typeof err === "object" && err !== null && "detail" in err
        ? String((err as { detail: unknown }).detail)
        : res.statusText;
    throw new Error(detail || "Delete failed");
  }
}

export async function setExaminationCentreMemberships(
  examinationId: number,
  centreId: string,
  assignments: PerExamCentreMembershipAssign[],
): Promise<PerExamCentreDetailResponse> {
  return apiJson<PerExamCentreDetailResponse>(
    `/examinations/${examinationId}/centres/${encodeURIComponent(centreId)}/memberships`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignments }),
    },
  );
}

export async function cloneExaminationCentresFrom(
  examinationId: number,
  sourceExaminationId: number,
): Promise<PerExamCentreListResponse> {
  return apiJson<PerExamCentreListResponse>(
    `/examinations/${examinationId}/centres/clone-from/${sourceExaminationId}`,
    { method: "POST" },
  );
}

export type ExaminationCentreMembershipScopeApi = "ALL" | "CORE" | "ELECTIVE";

export type ExaminationCentreBulkUploadError = {
  row_number: number;
  error_message: string;
};

export type ExaminationCentreBulkUploadResponse = {
  examination_id: number;
  subject_scope: ExaminationCentreMembershipScopeApi;
  total_rows: number;
  centres_created: number;
  memberships_added: number;
  memberships_skipped: number;
  failed: number;
  errors: ExaminationCentreBulkUploadError[];
};

export async function downloadExaminationCentresBulkTemplate(
  examinationId: number,
  subjectScope: ExaminationCentreMembershipScopeApi,
): Promise<void> {
  const q = new URLSearchParams({ subject_scope: subjectScope });
  await downloadApiFile(
    `/examinations/${examinationId}/centres/bulk-upload/template?${q.toString()}`,
    "examination_centres_bulk_template.xlsx",
  );
}

export async function uploadExaminationCentresBulk(
  examinationId: number,
  file: File,
  subjectScope: ExaminationCentreMembershipScopeApi,
): Promise<ExaminationCentreBulkUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  const q = new URLSearchParams({ subject_scope: subjectScope });
  return apiJson<ExaminationCentreBulkUploadResponse>(
    `/examinations/${examinationId}/centres/bulk-upload?${q.toString()}`,
    { method: "POST", body },
  );
}

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

export type InspectorPostingTargetPayload = {
  center_code: string;
  subject_scope: ExamInspectorSubjectScopeApi;
};

export type InspectorCreatePayload = {
  phone_number: string;
  full_name: string;
  password: string;
  /** When set with postings or core/elective, create postings for this examination. */
  examination_id?: number | null;
  /** Explicit centre+scope rows (alternative to core/elective shorthand). */
  postings?: InspectorPostingTargetPayload[];
  core?: string | null;
  elective?: string | null;
  /** Send login credentials via SMS when backend SMS is enabled. */
  send_sms?: boolean;
};

export type InspectorCreatedResponse = {
  id: string;
  sms_sent?: boolean | null;
  sms_error?: string | null;
};

export type InspectorPasswordResetPayload = {
  mode?: "auto" | "manual";
  new_password?: string;
  send_sms?: boolean;
};

export type InspectorPasswordResetResponse = {
  sms_sent?: boolean | null;
  sms_error?: string | null;
  sms_delivery_id?: string | null;
  generated_password?: string | null;
};

export type AdminPasswordResetPayload = {
  mode?: "auto" | "manual";
  new_password?: string;
};

export type AdminPasswordResetResponse = {
  generated_password?: string | null;
};

export type StaffEmailUserRow = {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
};

export type StaffEmailUserListResponse = {
  items: StaffEmailUserRow[];
  total: number;
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

export async function adminResetInspectorPassword(
  userId: string,
  payload: InspectorPasswordResetPayload,
): Promise<InspectorPasswordResetResponse> {
  return apiJson<InspectorPasswordResetResponse>(
    `/inspectors/${encodeURIComponent(userId)}/reset-password`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
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

export async function adminListTestAdminOfficers(
  skip: number,
  limit: number,
): Promise<StaffEmailUserListResponse> {
  return apiJson<StaffEmailUserListResponse>(`/test-admin-officers?skip=${skip}&limit=${limit}`);
}

export async function adminResetTestAdminOfficerPassword(
  userId: string,
  payload: AdminPasswordResetPayload,
): Promise<AdminPasswordResetResponse> {
  return apiJson<AdminPasswordResetResponse>(
    `/test-admin-officers/${encodeURIComponent(userId)}/reset-password`,
    { method: "POST", body: JSON.stringify(payload) },
  );
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

export async function adminListFinanceOfficers(
  skip: number,
  limit: number,
): Promise<StaffEmailUserListResponse> {
  return apiJson<StaffEmailUserListResponse>(`/finance-officers?skip=${skip}&limit=${limit}`);
}

export async function adminResetFinanceOfficerPassword(
  userId: string,
  payload: AdminPasswordResetPayload,
): Promise<AdminPasswordResetResponse> {
  return apiJson<AdminPasswordResetResponse>(
    `/finance-officers/${encodeURIComponent(userId)}/reset-password`,
    { method: "POST", body: JSON.stringify(payload) },
  );
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
  sms_sent?: boolean | null;
  sms_error?: string | null;
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
      throw new Error(apiNetworkErrorMessage());
    }
    throw e;
  }
  await assertAuthedResponse(res);
  return res;
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

/** Unauthenticated fetch for public invitation portal routes (no Bearer token). */
export async function publicApiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
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
      throw new Error(apiNetworkErrorMessage());
    }
    throw e;
  }
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return res;
}

export async function publicApiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await publicApiFetch(path, init);
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

export async function downloadApiFilePost(
  path: string,
  filename: string,
  body: unknown,
): Promise<void> {
  const res = await apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
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
  await assertAuthedResponse(res);
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
  centre_structure_mode?: "UNIFIED" | "SPLIT";
  created_at: string;
  updated_at: string;
};

export async function listExaminations(): Promise<Examination[]> {
  return apiJson<Examination[]>("/examinations");
}

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
  subject_type: SubjectTypeEnum;
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
  /** Substring match on bank name or branch name (case-insensitive). */
  search?: string | null;
  bank_name?: string | null;
  /** When set, only rows whose bank_name equals this string (exact). */
  bank_name_exact?: string | null;
  branch_name?: string | null;
  skip?: number;
  limit?: number;
};

export async function listBankBranches(params?: ListBankBranchesParams): Promise<BankBranchListResponse> {
  const q = new URLSearchParams();
  if (params?.search?.trim()) q.set("search", params.search.trim());
  else {
    if (params?.bank_name_exact?.trim()) q.set("bank_name_exact", params.bank_name_exact.trim());
    else if (params?.bank_name?.trim()) q.set("bank_name", params.bank_name.trim());
    if (params?.branch_name?.trim()) q.set("branch_name", params.branch_name.trim());
  }
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

export type StaffCandidateWriteDestination = {
  subject_scope: "ALL" | "CORE" | "ELECTIVE" | string;
  centre_id: string;
  centre_code: string;
  centre_name: string;
  centre_region: string;
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
  centre_structure_mode?: string;
  candidate_write_destinations?: StaffCandidateWriteDestination[];
  /** supervisor or inspector — controls dashboard presentation. */
  dashboard_viewer?: "supervisor" | "inspector";
  /** ALL, CORE, or ELECTIVE when dashboard_viewer is inspector. */
  centre_subject_scope?: string | null;
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
  has_location: boolean;
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
  sms_sent?: boolean | null;
  sms_error?: string | null;
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
  options?: { send_sms?: boolean },
): Promise<InspectorPostingBulkUploadResponse> {
  const body = new FormData();
  body.append("file", file);
  const q = options?.send_sms ? "?send_sms=true" : "";
  return apiJson<InspectorPostingBulkUploadResponse>(
    `/admin/examinations/${examinationId}/inspector-postings/bulk-upload${q}`,
    { method: "POST", body },
  );
}

export type SmsDeliveryRow = {
  id: string;
  user_id: string | null;
  recipient_full_name: string;
  /** @deprecated use recipient_full_name */
  inspector_full_name?: string;
  phone_number: string;
  msisdn: string;
  message_type: string;
  trigger: string;
  status: string;
  error_message: string | null;
  provider: string;
  retried_from_id: string | null;
  triggered_by_user_id: string | null;
  created_at: string;
  sent_at: string | null;
};

export type SmsDeliveryListResponse = {
  items: SmsDeliveryRow[];
  total: number;
};

export type SmsDeliveryRetryPayload = {
  mode: "auto" | "manual";
  new_password?: string;
};

export type SmsDeliveryRetryResponse = {
  delivery_id: string;
  sms_sent: boolean;
  sms_error: string | null;
  generated_password: string | null;
};

export type SmsDeliveryListParams = {
  skip?: number;
  limit?: number;
  status?: string;
  q?: string;
};

export async function listSmsDeliveries(
  params: SmsDeliveryListParams = {},
): Promise<SmsDeliveryListResponse> {
  const q = new URLSearchParams();
  if (params.skip != null) q.set("skip", String(params.skip));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.status) q.set("status", params.status);
  if (params.q?.trim()) q.set("q", params.q.trim());
  const s = q.toString();
  return apiJson<SmsDeliveryListResponse>(`/admin/sms-deliveries${s ? `?${s}` : ""}`);
}

export async function retrySmsDelivery(
  deliveryId: string,
  payload: SmsDeliveryRetryPayload,
): Promise<SmsDeliveryRetryResponse> {
  return apiJson<SmsDeliveryRetryResponse>(
    `/admin/sms-deliveries/${encodeURIComponent(deliveryId)}/retry`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

/** User-facing note when account saved but SMS failed or was skipped. */
export function inspectorSmsStatusMessage(
  sms_sent: boolean | null | undefined,
  sms_error: string | null | undefined,
): string | null {
  if (sms_sent === true) return null;
  if (sms_sent === false && sms_error) {
    return `Account saved, but SMS could not be sent: ${sms_error}`;
  }
  if (sms_sent === false) return "Account saved, but SMS could not be sent.";
  return null;
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
  subjectFilter?: TimetableSubjectFilter,
): Promise<StaffCentreDaySummaryResponse> {
  const q = new URLSearchParams({ examination_date: examinationDateIso });
  if (subjectFilter && subjectFilter !== "ALL") {
    q.set("subject_filter", subjectFilter);
  }
  return apiJson<StaffCentreDaySummaryResponse>(
    `/examinations/${examId}/my-center-day-summary?${q.toString()}`,
  );
}

export type ExecutiveCentreListItem = {
  center_id: string;
  center_code: string;
  center_name: string;
  region: string;
  zone: string;
  candidate_count: number;
  school_count: number;
  inspector_count: number;
};

export type NationalExecutiveOverviewResponse = StaffCentreOverviewResponse & {
  centres: ExecutiveCentreListItem[];
  centre_count: number;
};

export async function getStaffNationalOverview(
  examId: number,
  options?: { includeCentres?: boolean },
): Promise<NationalExecutiveOverviewResponse> {
  const q = new URLSearchParams();
  if (options?.includeCentres === false) {
    q.set("include_centres", "false");
  }
  const suffix = q.toString();
  return apiJson<NationalExecutiveOverviewResponse>(
    `/examinations/${examId}/national-overview${suffix ? `?${suffix}` : ""}`,
  );
}

export type ExecutivePostedInspectorItem = {
  posting_id: string;
  inspector_full_name: string;
  inspector_phone_number: string | null;
  subject_scope: string;
};

export type ExecutiveCentreDetailResponse = {
  overview: StaffCentreOverviewResponse;
  posted_inspectors: ExecutivePostedInspectorItem[];
  posted_inspector_posting_count?: number;
};

export async function getExecutiveCentreDetail(
  examId: number,
  centerId: string,
): Promise<ExecutiveCentreDetailResponse> {
  return apiJson<ExecutiveCentreDetailResponse>(
    `/examinations/${examId}/centres/${centerId}/executive-detail`,
  );
}

export type ExecutiveViewerCreatePayload = {
  email: string;
  password: string;
  full_name: string;
};

export type ExecutiveViewerCreatedResponse = {
  id: string;
  full_name: string;
  email: string;
};

export async function createExecutiveViewer(
  payload: ExecutiveViewerCreatePayload,
): Promise<ExecutiveViewerCreatedResponse> {
  return apiJson<ExecutiveViewerCreatedResponse>("/executive-viewers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminListExecutiveViewers(
  skip: number,
  limit: number,
): Promise<StaffEmailUserListResponse> {
  return apiJson<StaffEmailUserListResponse>(`/executive-viewers?skip=${skip}&limit=${limit}`);
}

export async function adminResetExecutiveViewerPassword(
  userId: string,
  payload: AdminPasswordResetPayload,
): Promise<AdminPasswordResetResponse> {
  return apiJson<AdminPasswordResetResponse>(
    `/executive-viewers/${encodeURIComponent(userId)}/reset-password`,
    { method: "POST", body: JSON.stringify(payload) },
  );
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
  await assertAuthedResponse(res);
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
  await assertAuthedResponse(res);
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
  no_scripts?: boolean;
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
  school_name?: string;
  /** Maximum for papers other than 1 and 2; default when paper-specific caps match this. */
  scripts_per_envelope: number;
  /** Effective max scannables per envelope for paper 1. */
  scripts_per_envelope_paper_1: number;
  /** Effective max answer booklets per envelope for paper 2. */
  scripts_per_envelope_paper_2: number;
  subjects: ScriptSubjectRowResponse[];
  examination_centre_id?: string | null;
  examination_centre_code?: string | null;
  examination_centre_name?: string | null;
  posted_inspectors?: ExecutivePostedInspectorItem[];
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
  no_scripts?: boolean;
  envelopes: ScriptEnvelopeItem[];
};

export type ScriptControlAdminListResponse = {
  items: ScriptControlAdminRow[];
  total: number;
  subject_series_counts: ScriptControlSubjectSeriesCountRow[];
  /** Keys `{examination_id}:{school_uuid}:{subject_id}` → distinct registered candidate count. */
  registered_candidates_by_school_subject?: Record<string, number>;
};

export type ScriptControlSchoolOverallStatus = "missing" | "partial" | "complete" | "verified";

export type ScriptControlSchoolStatusCounts = {
  missing: number;
  partial: number;
  complete: number;
  verified: number;
  total: number;
};

export type ScriptControlSchoolStatusRow = {
  school_id: string;
  school_code: string;
  school_name: string;
  region: string;
  zone: string;
  examination_id: number;
  subject_id: number;
  subject_code: string;
  subject_original_code?: string | null;
  subject_name: string;
  paper_number: number;
  registered_candidates: number;
  expected_series: number;
  recorded_series: number;
  verified_series: number;
  total_booklets: number;
  overall_status: ScriptControlSchoolOverallStatus;
  series_items: ScriptControlAdminRow[];
};

export type ScriptControlSchoolStatusListResponse = {
  items: ScriptControlSchoolStatusRow[];
  total: number;
  skip: number;
  limit: number;
  status_counts: ScriptControlSchoolStatusCounts;
  subject_series_counts: ScriptControlSubjectSeriesCountRow[];
};

export type ScriptControlSchoolStatusParams = {
  examination_id: number;
  subject_id: number;
  paper_number: number;
  region?: string;
  zone?: string;
  school_q?: string;
  status?: ScriptControlSchoolOverallStatus | "all";
  skip?: number;
  limit?: number;
};

export async function getScriptControlSchoolStatus(
  params: ScriptControlSchoolStatusParams,
): Promise<ScriptControlSchoolStatusListResponse> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  q.set("subject_id", String(params.subject_id));
  q.set("paper_number", String(params.paper_number));
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.zone?.trim()) q.set("zone", params.zone.trim());
  if (params.school_q?.trim()) q.set("school_q", params.school_q.trim());
  if (params.status && params.status !== "all") q.set("status", params.status);
  q.set("skip", String(params.skip ?? 0));
  q.set("limit", String(params.limit ?? 100));
  return apiJson<ScriptControlSchoolStatusListResponse>(`/script-control/school-status?${q}`);
}

export async function getIrregularScriptControlSchoolStatus(
  params: ScriptControlSchoolStatusParams,
): Promise<ScriptControlSchoolStatusListResponse> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  q.set("subject_id", String(params.subject_id));
  q.set("paper_number", String(params.paper_number));
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.zone?.trim()) q.set("zone", params.zone.trim());
  if (params.school_q?.trim()) q.set("school_q", params.school_q.trim());
  if (params.status && params.status !== "all") q.set("status", params.status);
  q.set("skip", String(params.skip ?? 0));
  q.set("limit", String(params.limit ?? 100));
  return apiJson<ScriptControlSchoolStatusListResponse>(`/irregular-script-control/school-status?${q}`);
}

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
  /** Worked scripts only: record nil return for this series. */
  no_scripts?: boolean;
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

/** Admin / test admin officer: full school grid for complete & correct. */
export async function getAdminSchoolScriptControl(
  examId: number,
  schoolId: string,
): Promise<MySchoolScriptControlResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<MySchoolScriptControlResponse>(
    `/examinations/${examId}/script-control/admin/school?${q}`,
  );
}

export async function getAdminSchoolIrregularScriptControl(
  examId: number,
  schoolId: string,
): Promise<MySchoolScriptControlResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<MySchoolScriptControlResponse>(
    `/examinations/${examId}/irregular-script-control/admin/school?${q}`,
  );
}

export async function upsertAdminScriptSeries(
  examId: number,
  schoolId: string,
  payload: ScriptSeriesUpsertPayload,
): Promise<ScriptSeriesPackingResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<ScriptSeriesPackingResponse>(
    `/examinations/${examId}/script-control/admin/school/series?${q}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function upsertAdminIrregularScriptSeries(
  examId: number,
  schoolId: string,
  payload: ScriptSeriesUpsertPayload,
): Promise<ScriptSeriesPackingResponse> {
  const q = new URLSearchParams({ school_id: schoolId.trim() });
  return apiJson<ScriptSeriesPackingResponse>(
    `/examinations/${examId}/irregular-script-control/admin/school/series?${q}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteAdminScriptSeries(
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
  await apiJson(`/examinations/${examId}/script-control/admin/school/series?${q}`, {
    method: "DELETE",
  });
}

export async function deleteAdminIrregularScriptSeries(
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
  await apiJson(`/examinations/${examId}/irregular-script-control/admin/school/series?${q}`, {
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

export type RecordSubjectScope = "CORE" | "ELECTIVE";

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
  subject_scope: RecordSubjectScope;
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

export type ExamOfficialImportPreviewRow = {
  source_official: ExamCentreOfficialResponse;
  duplicate_in_destination: boolean;
  importable: boolean;
};

export type ExamOfficialImportPreviewResponse = {
  source_scope: RecordSubjectScope;
  destination_scope: RecordSubjectScope;
  items: ExamOfficialImportPreviewRow[];
};

export type ExamOfficialImportItemPayload = {
  source_official_id: string;
  num_days: number;
};

export type ExamOfficialImportRequestPayload = {
  items: ExamOfficialImportItemPayload[];
};

export type ExamOfficialImportResponse = {
  created: ExamCentreOfficialResponse[];
  requested: number;
  created_count: number;
  skipped_duplicates: number;
};

function examOfficialsQuery(postingId?: string | null, workingScope?: RecordSubjectScope | null): string {
  const u = new URLSearchParams();
  if (postingId?.trim()) u.set("posting_id", postingId.trim());
  if (workingScope) u.set("working_scope", workingScope);
  const s = u.toString();
  return s ? `?${s}` : "";
}

export type InspectorSubmissionStatus = {
  core_period_open: boolean;
  core_submission_period_start: string | null;
  core_submission_period_end: string | null;
  elective_period_open: boolean;
  elective_submission_period_start: string | null;
  elective_submission_period_end: string | null;
  officials_core_enabled: boolean;
  officials_elective_enabled: boolean;
};

export function isInspectorScopePeriodOpen(
  status: InspectorSubmissionStatus | null | undefined,
  scope: RecordSubjectScope,
): boolean {
  if (!status) return false;
  return scope === "CORE" ? status.core_period_open : status.elective_period_open;
}

export function inspectorScopePeriodEnd(
  status: InspectorSubmissionStatus,
  scope: RecordSubjectScope,
): string | null {
  return scope === "CORE" ? status.core_submission_period_end : status.elective_submission_period_end;
}

export function formatSubmissionDeadlineDate(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatSubmissionPeriodRange(
  status: InspectorSubmissionStatus,
  scope: RecordSubjectScope,
): string | null {
  const start = scope === "CORE" ? status.core_submission_period_start : status.elective_submission_period_start;
  const end = scope === "CORE" ? status.core_submission_period_end : status.elective_submission_period_end;
  if (!start || !end) return null;
  return `${formatSubmissionDeadlineDate(start)} to ${formatSubmissionDeadlineDate(end)}`;
}

export function inspectorSubmissionDeadlineReminder(
  status: InspectorSubmissionStatus,
  scope: RecordSubjectScope,
): string | null {
  if (!isInspectorScopePeriodOpen(status, scope)) return null;
  const end = inspectorScopePeriodEnd(status, scope);
  if (!end) return null;
  const scopeLabel = scope === "CORE" ? "core" : "elective";
  return `Please submit officers' bank account details for the ${scopeLabel} examination by ${formatSubmissionDeadlineDate(end)}.`;
}

/** Single human-readable notice for the inspector exam-officials page. */
export function inspectorOfficialsSubmissionNotice(
  status: InspectorSubmissionStatus,
  scope: RecordSubjectScope,
): string | null {
  const scopeLabel = scope === "CORE" ? "core" : "elective";
  const periodOpen = isInspectorScopePeriodOpen(status, scope);
  const uploadsEnabled = scope === "CORE" ? status.officials_core_enabled : status.officials_elective_enabled;
  const deadline = inspectorScopePeriodEnd(status, scope);
  const deadlineLabel = deadline ? formatSubmissionDeadlineDate(deadline) : null;

  if (!periodOpen) {
    const start = scope === "CORE" ? status.core_submission_period_start : status.elective_submission_period_start;
    const end = scope === "CORE" ? status.core_submission_period_end : status.elective_submission_period_end;
    if (start && end) {
      return `Opens ${formatSubmissionDeadlineDate(start)} · closes ${formatSubmissionDeadlineDate(end)}`;
    }
    return "Submissions not open yet.";
  }

  if (!uploadsEnabled) {
    return "Bank accounts submission is currently not available.";
  }

  if (deadlineLabel) {
    return `Please submit officers' bank account details for the ${scopeLabel} examination by ${deadlineLabel}.`;
  }

  return null;
}

export function inspectorOpenSubmissionDeadlineReminders(status: InspectorSubmissionStatus): string[] {
  return (["CORE", "ELECTIVE"] as RecordSubjectScope[])
    .map((scope) => inspectorSubmissionDeadlineReminder(status, scope))
    .filter((msg): msg is string => msg != null);
}

export function inspectorScopePeriodLabel(
  status: InspectorSubmissionStatus,
  scope: RecordSubjectScope,
): string | null {
  const start = scope === "CORE" ? status.core_submission_period_start : status.elective_submission_period_start;
  const end = scope === "CORE" ? status.core_submission_period_end : status.elective_submission_period_end;
  if (!start || !end) return null;
  return `${start} – ${end}`;
}

export async function getInspectorSubmissionStatus(examId: number): Promise<InspectorSubmissionStatus> {
  return apiJson<InspectorSubmissionStatus>(`/examinations/${examId}/inspector-submission-status`);
}

export type InspectorSubmissionSettings = {
  examination_id: number;
  core_submission_period_start: string | null;
  core_submission_period_end: string | null;
  elective_submission_period_start: string | null;
  elective_submission_period_end: string | null;
  officials_core_enabled: boolean;
  officials_elective_enabled: boolean;
  updated_at: string | null;
};

export type InspectorSubmissionSettingsPut = {
  core_submission_period_start: string | null;
  core_submission_period_end: string | null;
  elective_submission_period_start: string | null;
  elective_submission_period_end: string | null;
  officials_core_enabled: boolean;
  officials_elective_enabled: boolean;
};

export async function getAdminInspectorSubmissionSettings(
  examId: number,
): Promise<InspectorSubmissionSettings> {
  return apiJson<InspectorSubmissionSettings>(
    `/admin/examinations/${examId}/inspector-submission-settings`,
  );
}

export async function putAdminInspectorSubmissionSettings(
  examId: number,
  payload: InspectorSubmissionSettingsPut,
): Promise<InspectorSubmissionSettings> {
  return apiJson<InspectorSubmissionSettings>(
    `/admin/examinations/${examId}/inspector-submission-settings`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function getExamOfficialsForMyCentre(
  examId: number,
  postingId?: string | null,
  workingScope?: RecordSubjectScope | null,
): Promise<ExamCentreOfficialListResponse> {
  return apiJson<ExamCentreOfficialListResponse>(
    `/examinations/${examId}/exam-officials/my-centre${examOfficialsQuery(postingId, workingScope)}`,
  );
}

export async function createExamOfficial(
  examId: number,
  payload: ExamCentreOfficialCreatePayload,
  postingId?: string | null,
  workingScope?: RecordSubjectScope | null,
): Promise<ExamCentreOfficialResponse> {
  return apiJson<ExamCentreOfficialResponse>(
    `/examinations/${examId}/exam-officials/my-centre${examOfficialsQuery(postingId, workingScope)}`,
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
  workingScope?: RecordSubjectScope | null,
): Promise<ExamCentreOfficialResponse> {
  return apiJson<ExamCentreOfficialResponse>(
    `/examinations/${examId}/exam-officials/my-centre/${officialId.trim()}${examOfficialsQuery(postingId, workingScope)}`,
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
  workingScope?: RecordSubjectScope | null,
): Promise<void> {
  await apiJson(
    `/examinations/${examId}/exam-officials/my-centre/${officialId.trim()}${examOfficialsQuery(postingId, workingScope)}`,
    { method: "DELETE" },
  );
}

export async function getExamOfficialsImportPreview(
  examId: number,
  postingId?: string | null,
  workingScope?: RecordSubjectScope | null,
): Promise<ExamOfficialImportPreviewResponse> {
  return apiJson<ExamOfficialImportPreviewResponse>(
    `/examinations/${examId}/exam-officials/my-centre/import-preview${examOfficialsQuery(postingId, workingScope)}`,
  );
}

export async function importExamOfficialsFromOtherScope(
  examId: number,
  payload: ExamOfficialImportRequestPayload,
  postingId?: string | null,
  workingScope?: RecordSubjectScope | null,
): Promise<ExamOfficialImportResponse> {
  return apiJson<ExamOfficialImportResponse>(
    `/examinations/${examId}/exam-officials/my-centre/import${examOfficialsQuery(postingId, workingScope)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function downloadExamOfficialsSummaryPdf(
  examId: number,
  postingId?: string | null,
  workingScope?: RecordSubjectScope | null,
  filename?: string,
): Promise<void> {
  const path = `/examinations/${examId}/exam-officials/my-centre/summary.pdf${examOfficialsQuery(postingId, workingScope)}`;
  const defaultName = "official_accounts_summary.pdf";
  await downloadApiFile(path, filename?.trim() || defaultName);
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
  subject_scope: RecordSubjectScope;
  created_at: string;
  updated_at: string;
  daily_rate_ghs?: string | null;
  commuting_allowance_ghs?: string | null;
  airtime_ghs?: string | null;
  total_payable_ghs?: string | null;
};

export type ExaminationDesignationRateRow = {
  designation: string;
  daily_rate_ghs: string | null;
  commuting_allowance_ghs: string | null;
  airtime_ghs: string | null;
};

export type ExaminationDesignationRatesResponse = {
  examination_id: number;
  items: ExaminationDesignationRateRow[];
};

export type ExaminationDesignationRateItemUpdate = {
  designation: string;
  daily_rate_ghs?: string | null;
  commuting_allowance_ghs?: string | null;
  airtime_ghs?: string | null;
};

export async function getExaminationDesignationRates(
  examId: number,
): Promise<ExaminationDesignationRatesResponse> {
  return apiJson<ExaminationDesignationRatesResponse>(`/admin/examinations/${examId}/designation-rates`);
}

export async function putExaminationDesignationRates(
  examId: number,
  items: ExaminationDesignationRateItemUpdate[],
): Promise<ExaminationDesignationRatesResponse> {
  return apiJson<ExaminationDesignationRatesResponse>(`/admin/examinations/${examId}/designation-rates`, {
    method: "PUT",
    body: JSON.stringify({ items }),
  });
}

export type ExaminerAllowanceTypeApi =
  | "responsibility_allowance"
  | "inconvenience_allowance"
  | "chief_examiners_report"
  | "vetting_of_scripts"
  | "internal_commuting";

export type ExaminerAllowanceSubjectRef = {
  id: number;
  code: string;
  name: string;
  subject_type: SubjectTypeEnum;
  paper_numbers: number[];
};

export type ExaminerRoleAllowanceRateCell = {
  examiner_type: ExaminerTypeApi;
  allowance_type: ExaminerAllowanceTypeApi;
  amount_ghs: string | null;
};

export type ExaminationExaminerRoleAllowanceRatesResponse = {
  examination_id: number;
  items: ExaminerRoleAllowanceRateCell[];
};

export type ExaminerRoleAllowanceRateItemUpdate = {
  examiner_type: ExaminerTypeApi;
  allowance_type: ExaminerAllowanceTypeApi;
  amount_ghs?: string | null;
};

export type ExaminerMarkingRateRow = {
  subject_id: number;
  paper_number: number;
  rate_per_script_ghs: string | null;
};

export type ExaminationExaminerMarkingRatesResponse = {
  examination_id: number;
  subjects: ExaminerAllowanceSubjectRef[];
  items: ExaminerMarkingRateRow[];
};

export type ExaminerMarkingRateItemUpdate = {
  subject_id: number;
  paper_number: number;
  rate_per_script_ghs?: string | null;
};

export type ExaminerTravelRateRow = {
  region: string;
  amount_ghs: string | null;
};

export type ExaminerTravelZoneRow = {
  id: string;
  name: string;
  regions: string[];
};

export type ExaminerTravelRoleFactorRow = {
  examiner_type: ExaminerTypeApi;
  zone_id: string;
  factor: string | null;
};

export type ExaminationExaminerTravelRatesResponse = {
  examination_id: number;
  zones: ExaminerTravelZoneRow[];
  items: ExaminerTravelRateRow[];
  role_factors: ExaminerTravelRoleFactorRow[];
};

export type SubjectMarkingBreakdownRow = {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  paper_number: number;
  allocated_booklets: number;
  rate_per_script_ghs?: string | null;
  marking_allowance_ghs?: string | null;
  script_source?: "allocation" | "manual";
};

export type AdminExaminerAllowanceRow = {
  id: string;
  examination_id: number;
  examination_label: string;
  full_name: string;
  examiner_type: ExaminerTypeApi;
  region: string;
  subject_codes: string;
  subject_names: string;
  bank_branch_id?: string | null;
  bank_code?: string | null;
  bank_name?: string | null;
  branch_name?: string | null;
  account_number?: string | null;
  phone_number?: string | null;
  responsibility_allowance_ghs: string;
  inconvenience_allowance_ghs: string;
  chief_examiners_report_ghs: string;
  vetting_of_scripts_ghs: string;
  internal_commuting_ghs: string;
  marking_allowance_ghs: string;
  travel_base_ghs: string;
  travel_zone_name?: string | null;
  travel_role_factor: string;
  travel_and_transport_ghs: string;
  total_allocated_scripts: number;
  marking_withholding_tax_ghs: string;
  marking_net_ghs: string;
  vetting_withholding_tax_ghs: string;
  vetting_net_ghs: string;
  payout_travel_commuting_ghs: string;
  payout_allowances_marking_ghs: string;
  total_payable_ghs: string;
  subject_breakdowns: SubjectMarkingBreakdownRow[];
  created_at: string;
  updated_at: string;
};

export type AdminExaminerAllowanceListResponse = {
  items: AdminExaminerAllowanceRow[];
  total: number;
};

export type AdminExaminerMarkingSubjectSummaryRow = {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  registered_candidates: number;
  total_allocated_scripts: number;
  examiner_count: number;
  variance: number;
};

export type AdminExaminerMarkingSubjectSummaryResponse = {
  items: AdminExaminerMarkingSubjectSummaryRow[];
  total: number;
};

export async function listAdminExaminerMarkingSubjectSummary(
  examinationId: number,
): Promise<AdminExaminerMarkingSubjectSummaryResponse> {
  return apiJson<AdminExaminerMarkingSubjectSummaryResponse>(
    `/admin/examinations/${examinationId}/examiner-marking-subject-summary`,
  );
}

export async function getExaminationExaminerRoleAllowanceRates(
  examId: number,
): Promise<ExaminationExaminerRoleAllowanceRatesResponse> {
  return apiJson<ExaminationExaminerRoleAllowanceRatesResponse>(
    `/admin/examinations/${examId}/examiner-role-allowance-rates`,
  );
}

export async function putExaminationExaminerRoleAllowanceRates(
  examId: number,
  items: ExaminerRoleAllowanceRateItemUpdate[],
): Promise<ExaminationExaminerRoleAllowanceRatesResponse> {
  return apiJson<ExaminationExaminerRoleAllowanceRatesResponse>(
    `/admin/examinations/${examId}/examiner-role-allowance-rates`,
    {
      method: "PUT",
      body: JSON.stringify({ items }),
    },
  );
}

export async function getExaminationExaminerMarkingRates(
  examId: number,
): Promise<ExaminationExaminerMarkingRatesResponse> {
  return apiJson<ExaminationExaminerMarkingRatesResponse>(
    `/admin/examinations/${examId}/examiner-marking-rates`,
  );
}

export async function putExaminationExaminerMarkingRates(
  examId: number,
  items: ExaminerMarkingRateItemUpdate[],
): Promise<ExaminationExaminerMarkingRatesResponse> {
  return apiJson<ExaminationExaminerMarkingRatesResponse>(
    `/admin/examinations/${examId}/examiner-marking-rates`,
    {
      method: "PUT",
      body: JSON.stringify({ items }),
    },
  );
}

export async function getExaminationExaminerTravelRates(
  examId: number,
): Promise<ExaminationExaminerTravelRatesResponse> {
  return apiJson<ExaminationExaminerTravelRatesResponse>(
    `/admin/examinations/${examId}/examiner-travel-rates`,
  );
}

export async function putExaminationExaminerTravelRates(
  examId: number,
  payload: {
    items: { region: string; amount_ghs?: string | null }[];
    zones?: { id?: string | null; name: string; regions: string[] }[];
    role_factors?: {
      examiner_type: ExaminerTypeApi;
      zone_id: string;
      factor?: string | null;
    }[];
  },
): Promise<ExaminationExaminerTravelRatesResponse> {
  return apiJson<ExaminationExaminerTravelRatesResponse>(
    `/admin/examinations/${examId}/examiner-travel-rates`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function copyExaminationExaminerAllowanceRates(
  examId: number,
  sourceExamId: number,
): Promise<{ examination_id: number; copied: boolean }> {
  return apiJson<{ examination_id: number; copied: boolean }>(
    `/admin/examinations/${examId}/examiner-allowance-rates/copy-from/${sourceExamId}`,
    { method: "POST" },
  );
}

export async function listAdminExaminerAllowances(params: {
  examination_id: number;
  role?: string | null;
  region?: string | null;
  subject_id?: number | null;
  search?: string | null;
  skip?: number;
  limit?: number;
}): Promise<AdminExaminerAllowanceListResponse> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  if (params.role?.trim()) q.set("role", params.role.trim());
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.subject_id != null) q.set("subject_id", String(params.subject_id));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.skip != null) q.set("skip", String(params.skip));
  if (params.limit != null) q.set("limit", String(params.limit));
  return apiJson<AdminExaminerAllowanceListResponse>(`/admin/examiner-allowances?${q.toString()}`);
}

export async function downloadAdminExaminerAllowancesExport(params: {
  examination_id: number;
  role?: string | null;
  region?: string | null;
  subject_id?: number | null;
  search?: string | null;
  filename: string;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  if (params.role?.trim()) q.set("role", params.role.trim());
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.subject_id != null) q.set("subject_id", String(params.subject_id));
  if (params.search?.trim()) q.set("search", params.search.trim());
  await downloadApiFile(`/admin/examiner-allowances/export.xlsx?${q.toString()}`, params.filename);
}

export type ExaminerBogPayoutMode = "all" | "travel_commuting" | "allowances_marking";

export async function downloadAdminExaminerAllowancesBogExport(params: {
  examination_id: number;
  role?: string | null;
  region?: string | null;
  subject_id?: number | null;
  search?: string | null;
  payout_mode?: ExaminerBogPayoutMode;
  filename: string;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  if (params.role?.trim()) q.set("role", params.role.trim());
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.subject_id != null) q.set("subject_id", String(params.subject_id));
  if (params.search?.trim()) q.set("search", params.search.trim());
  if (params.payout_mode && params.payout_mode !== "all") q.set("payout_mode", params.payout_mode);
  await downloadApiFile(`/admin/examiner-allowances/bog-export.xlsx?${q.toString()}`, params.filename);
}

export type AdminExamCentreOfficialListResponse = {
  items: AdminExamCentreOfficialRow[];
  total: number;
};

export type AdminExamCentreOfficialsExportLayout = "zip" | "combined" | "single_sheet";

export async function listAdminExamCentreOfficials(params: {
  examination_id: number;
  center_id?: string | null;
  designation?: string | null;
  designations?: string[];
  subject_scope?: RecordSubjectScope | null;
  region?: string | null;
  skip?: number;
  limit?: number;
  sort_by?: "center_code" | "full_name" | "num_days";
  sort_dir?: "asc" | "desc";
}): Promise<AdminExamCentreOfficialListResponse> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  if (params.center_id) q.set("center_id", params.center_id.trim());
  if (params.designations?.length) {
    for (const d of params.designations) q.append("designations", d);
  } else if (params.designation?.trim()) {
    q.set("designation", params.designation.trim());
  }
  if (params.subject_scope) q.set("subject_scope", params.subject_scope);
  if (params.region?.trim()) q.set("region", params.region.trim());
  if (params.skip != null) q.set("skip", String(params.skip));
  if (params.limit != null) q.set("limit", String(params.limit));
  if (params.sort_by) q.set("sort_by", params.sort_by);
  if (params.sort_dir) q.set("sort_dir", params.sort_dir);
  return apiJson<AdminExamCentreOfficialListResponse>(`/admin/exam-centre-officials?${q.toString()}`);
}

export async function downloadAdminExamCentreOfficialsExport(params: {
  examination_id: number;
  layout: AdminExamCentreOfficialsExportLayout;
  center_id?: string | null;
  designation?: string | null;
  designations?: string[];
  export_slug?: string;
  subject_scope?: RecordSubjectScope | null;
  region?: string | null;
  filename: string;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  q.set("layout", params.layout);
  if (params.center_id) q.set("center_id", params.center_id.trim());
  if (params.designations?.length) {
    for (const d of params.designations) q.append("designations", d);
  } else if (params.designation?.trim()) {
    q.set("designation", params.designation.trim());
  }
  if (params.export_slug?.trim()) q.set("export_slug", params.export_slug.trim());
  if (params.subject_scope) q.set("subject_scope", params.subject_scope);
  if (params.region?.trim()) q.set("region", params.region.trim());
  await downloadApiFile(`/admin/exam-centre-officials/export?${q.toString()}`, params.filename);
}

export async function downloadAdminExamCentreOfficialsBogExport(params: {
  examination_id: number;
  center_id?: string | null;
  designation?: string | null;
  designations?: string[];
  export_slug?: string;
  subject_scope?: RecordSubjectScope | null;
  region?: string | null;
  filename: string;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  if (params.center_id) q.set("center_id", params.center_id.trim());
  if (params.designations?.length) {
    for (const d of params.designations) q.append("designations", d);
  } else if (params.designation?.trim()) {
    q.set("designation", params.designation.trim());
  }
  if (params.export_slug?.trim()) q.set("export_slug", params.export_slug.trim());
  if (params.subject_scope) q.set("subject_scope", params.subject_scope);
  if (params.region?.trim()) q.set("region", params.region.trim());
  await downloadApiFile(`/admin/exam-centre-officials/bog-export?${q.toString()}`, params.filename);
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

export type FinanceCentreSchoolSummaryRoleCounts = {
  external_inspector: number;
  police_officer: number;
  supervisor: number;
  depot_keeper: number;
  assistant_supervisor: number;
};

export type AssignedInspectorAtCentre = {
  inspector_id: string;
  full_name: string;
  phone: string | null;
};

export type FinanceCentreSchoolSummaryResponse = {
  center_id: string;
  center_code: string;
  center_name: string;
  subject_filter: TimetableSubjectFilter;
  expected_invigilations_total: number;
  invigilator_days_declared: number;
  variance: number;
  role_counts: FinanceCentreSchoolSummaryRoleCounts;
  officials: AdminExamCentreOfficialRow[];
  assigned_inspectors: AssignedInspectorAtCentre[];
};

export type FinanceCentreOfficialStatisticsRow = {
  center_id: string;
  center_code: string;
  center_name: string;
  invigilator_count: number;
  invigilator_days: number;
  expected_invigilator_days: number;
  invigilator_variance: number;
  external_inspector: number;
  supervisor: number;
  assistant_supervisor: number;
  police_officer: number;
  depot_keeper: number;
  total_officials: number;
};

export type FinanceCentreOfficialStatisticsResponse = {
  examination_id: number;
  subject_filter: TimetableSubjectFilter;
  centres: FinanceCentreOfficialStatisticsRow[];
  totals: FinanceCentreOfficialStatisticsRow;
};

export type FinanceCentreOfficialStatisticsShellResponse = {
  examination_id: number;
  subject_filter: TimetableSubjectFilter;
  centres: { center_id: string; center_code: string; center_name: string }[];
};

export type FinanceCentreInspectorAnalysisRow = {
  center_id: string;
  center_code: string;
  center_name: string;
  center_region: string | null;
  subject_filter: TimetableSubjectFilter;
  total_candidates: number;
  exam_days: number;
  external_inspector_count: number;
  posted_inspector_count: number;
  unique_inspector_count: number;
  inspectors_in_both: number;
  total_inspector_pay_ghs: string;
  max_inspector_assigned_days: number;
  assigned_days_variance: number;
  pay_at_exam_days_ghs: string;
  pay_at_assigned_days_ghs: string;
  days_pay_variance_ghs: string;
  pay_at_posted_count_ghs: string;
  payroll_vs_posted_variance_ghs: string;
  inspectors_required: number;
  paid_inspector_variance: number;
  candidates_per_paid_inspector: number | null;
};

export type FinanceCentreInspectorAnalysisResponse = {
  examination_id: number;
  subject_filter: TimetableSubjectFilter;
  candidates_per_inspector: number;
  centres: FinanceCentreInspectorAnalysisRow[];
  totals: FinanceCentreInspectorAnalysisRow;
};

export function normalizeInspectorAnalysisRow(
  row: Partial<FinanceCentreInspectorAnalysisRow> &
    Pick<FinanceCentreInspectorAnalysisRow, "center_id" | "center_code" | "center_name" | "subject_filter">,
): FinanceCentreInspectorAnalysisRow {
  const examDays = row.exam_days ?? 0;
  const maxAssigned = row.max_inspector_assigned_days ?? 0;
  const payAtExam = row.pay_at_exam_days_ghs ?? "0";
  const payAtAssigned = row.pay_at_assigned_days_ghs ?? row.total_inspector_pay_ghs ?? "0";
  const payAtPosted = row.pay_at_posted_count_ghs ?? "0";
  const totalPay = row.total_inspector_pay_ghs ?? "0";
  return {
    center_id: row.center_id,
    center_code: row.center_code,
    center_name: row.center_name,
    center_region: row.center_region ?? null,
    subject_filter: row.subject_filter,
    total_candidates: row.total_candidates ?? 0,
    exam_days: examDays,
    external_inspector_count: row.external_inspector_count ?? 0,
    posted_inspector_count: row.posted_inspector_count ?? 0,
    unique_inspector_count: row.unique_inspector_count ?? 0,
    inspectors_in_both: row.inspectors_in_both ?? 0,
    total_inspector_pay_ghs: totalPay,
    max_inspector_assigned_days: maxAssigned,
    assigned_days_variance: row.assigned_days_variance ?? maxAssigned - examDays,
    pay_at_exam_days_ghs: payAtExam,
    pay_at_assigned_days_ghs: payAtAssigned,
    days_pay_variance_ghs:
      row.days_pay_variance_ghs ?? String(Number(payAtAssigned) - Number(payAtExam)),
    pay_at_posted_count_ghs: payAtPosted,
    payroll_vs_posted_variance_ghs:
      row.payroll_vs_posted_variance_ghs ?? String(Number(totalPay) - Number(payAtPosted)),
    inspectors_required: row.inspectors_required ?? 0,
    paid_inspector_variance: row.paid_inspector_variance ?? 0,
    candidates_per_paid_inspector: row.candidates_per_paid_inspector ?? null,
  };
}

export function sumInspectorAnalysisRowsFromCentres(
  centres: FinanceCentreInspectorAnalysisRow[],
  subjectFilter: TimetableSubjectFilter,
): FinanceCentreInspectorAnalysisRow {
  const totals = centres.reduce<FinanceCentreInspectorAnalysisRow>(
    (acc, row) => ({
      center_id: "00000000-0000-0000-0000-000000000000",
      center_code: "TOTAL",
      center_name: "",
      subject_filter: row.subject_filter,
      total_candidates: acc.total_candidates + row.total_candidates,
      exam_days: acc.exam_days + row.exam_days,
      external_inspector_count: acc.external_inspector_count + row.external_inspector_count,
      posted_inspector_count: acc.posted_inspector_count + row.posted_inspector_count,
      unique_inspector_count: acc.unique_inspector_count + row.unique_inspector_count,
      inspectors_in_both: acc.inspectors_in_both + row.inspectors_in_both,
      total_inspector_pay_ghs: String(Number(acc.total_inspector_pay_ghs) + Number(row.total_inspector_pay_ghs)),
      max_inspector_assigned_days: acc.max_inspector_assigned_days + row.max_inspector_assigned_days,
      assigned_days_variance: 0,
      pay_at_exam_days_ghs: String(Number(acc.pay_at_exam_days_ghs) + Number(row.pay_at_exam_days_ghs)),
      pay_at_assigned_days_ghs: String(
        Number(acc.pay_at_assigned_days_ghs) + Number(row.pay_at_assigned_days_ghs),
      ),
      days_pay_variance_ghs: "0",
      pay_at_posted_count_ghs: String(
        Number(acc.pay_at_posted_count_ghs) + Number(row.pay_at_posted_count_ghs),
      ),
      payroll_vs_posted_variance_ghs: "0",
      inspectors_required: acc.inspectors_required + row.inspectors_required,
      paid_inspector_variance:
        acc.external_inspector_count + row.external_inspector_count -
        (acc.inspectors_required + row.inspectors_required),
      candidates_per_paid_inspector: null,
    }),
    normalizeInspectorAnalysisRow({
      center_id: "00000000-0000-0000-0000-000000000000",
      center_code: "TOTAL",
      center_name: "",
      subject_filter: subjectFilter,
    }),
  );

  const ext = totals.external_inspector_count;
  if (ext > 0) {
    totals.candidates_per_paid_inspector = Math.round((totals.total_candidates / ext) * 10) / 10;
  }
  totals.paid_inspector_variance = ext - totals.inspectors_required;
  totals.assigned_days_variance = totals.max_inspector_assigned_days - totals.exam_days;
  totals.days_pay_variance_ghs = String(
    Number(totals.pay_at_assigned_days_ghs) - Number(totals.pay_at_exam_days_ghs),
  );
  totals.payroll_vs_posted_variance_ghs = String(
    Number(totals.total_inspector_pay_ghs) - Number(totals.pay_at_posted_count_ghs),
  );
  return totals;
}

export function normalizeInspectorAnalysisResponse(
  data: FinanceCentreInspectorAnalysisResponse,
): FinanceCentreInspectorAnalysisResponse {
  const centres = data.centres.map((row) => normalizeInspectorAnalysisRow(row));
  const totals =
    data.totals?.max_inspector_assigned_days != null
      ? normalizeInspectorAnalysisRow({
          ...data.totals,
          center_id: data.totals.center_id,
          center_code: data.totals.center_code,
          center_name: data.totals.center_name,
          subject_filter: data.totals.subject_filter,
        })
      : sumInspectorAnalysisRowsFromCentres(centres, data.subject_filter);
  return {
    ...data,
    centres,
    totals,
  };
}

export type FinanceCentreInspectorAnalysisShellResponse = {
  examination_id: number;
  subject_filter: TimetableSubjectFilter;
  centres: { center_id: string; center_code: string; center_name: string; center_region: string | null }[];
};

function centreSchoolSummaryQuery(params: {
  centerId: string;
  subject_filter?: TimetableSubjectFilter;
}): string {
  const q = new URLSearchParams();
  q.set("center_id", params.centerId.trim());
  q.set("subject_filter", params.subject_filter ?? "ALL");
  return `?${q.toString()}`;
}

export function schoolSummaryExportFilename(
  centerCode: string,
  centerName: string,
  subjectFilter: TimetableSubjectFilter,
): string {
  const suffix =
    subjectFilter === "CORE_ONLY" ? "CORE" : subjectFilter === "ELECTIVE_ONLY" ? "ELECTIVE" : "ALL";
  return `${centerCode} ${centerName} ${suffix}.xlsx`;
}

export function centreBogExportFilename(
  centerCode: string,
  centerName: string,
  subjectFilter: TimetableSubjectFilter,
): string {
  const suffix =
    subjectFilter === "CORE_ONLY" ? "CORE" : subjectFilter === "ELECTIVE_ONLY" ? "ELECTIVE" : "ALL";
  return `${centerCode} ${centerName} BoG ${suffix}.xlsx`;
}

export function examOfficialsBogExportFilename(
  examLabel: string,
  slug: string,
  centerSuffix?: string,
): string {
  const base = examLabel.replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").slice(0, 80) || "exam";
  const part = centerSuffix ? `${base}${centerSuffix}_bog_${slug}` : `${base}_bog_${slug}`;
  return `${part}.xlsx`;
}

export async function getFinanceCentreSchoolSummary(params: {
  examId: number;
  centerId: string;
  subject_filter?: TimetableSubjectFilter;
}): Promise<FinanceCentreSchoolSummaryResponse> {
  return apiJson<FinanceCentreSchoolSummaryResponse>(
    `/examinations/${params.examId}/finance/centre-school-summary${centreSchoolSummaryQuery(params)}`,
  );
}

export async function downloadFinanceCentreSchoolSummaryExport(params: {
  examId: number;
  centerId: string;
  subject_filter?: TimetableSubjectFilter;
  filename: string;
}): Promise<void> {
  await downloadApiFile(
    `/examinations/${params.examId}/finance/centre-school-summary/export${centreSchoolSummaryQuery({
      centerId: params.centerId,
      subject_filter: params.subject_filter,
    })}`,
    params.filename,
  );
}

export async function downloadFinanceCentreSchoolSummaryBogExport(params: {
  examId: number;
  centerId: string;
  subject_filter?: TimetableSubjectFilter;
  filename: string;
}): Promise<void> {
  await downloadApiFile(
    `/examinations/${params.examId}/finance/centre-school-summary/bog-export${centreSchoolSummaryQuery({
      centerId: params.centerId,
      subject_filter: params.subject_filter,
    })}`,
    params.filename,
  );
}

export function officialStatisticsExportFilename(
  examLabel: string,
  subjectFilter: TimetableSubjectFilter,
): string {
  const suffix =
    subjectFilter === "CORE_ONLY" ? "CORE" : subjectFilter === "ELECTIVE_ONLY" ? "ELECTIVE" : "ALL";
  return `${examLabel} official-statistics ${suffix}.xlsx`;
}

const FINANCE_CENTRE_FETCH_CONCURRENCY = 5;

export async function getFinanceCentreOfficialStatistics(params: {
  examId: number;
  subject_filter: TimetableSubjectFilter;
}): Promise<FinanceCentreOfficialStatisticsResponse> {
  return apiJson<FinanceCentreOfficialStatisticsResponse>(
    `/examinations/${params.examId}/finance/centre-official-statistics${financeSummaryQuery(params.subject_filter)}`,
  );
}

export async function getFinanceCentreOfficialStatisticsShell(params: {
  examId: number;
  subject_filter: TimetableSubjectFilter;
}): Promise<FinanceCentreOfficialStatisticsShellResponse> {
  return apiJson<FinanceCentreOfficialStatisticsShellResponse>(
    `/examinations/${params.examId}/finance/centre-official-statistics/shell${financeSummaryQuery(params.subject_filter)}`,
  );
}

export async function getFinanceCentreOfficialStatisticsForCentre(params: {
  examId: number;
  center_host_id: string;
  subject_filter: TimetableSubjectFilter;
}): Promise<FinanceCentreOfficialStatisticsRow> {
  return apiJson<FinanceCentreOfficialStatisticsRow>(
    `/examinations/${params.examId}/finance/centre-official-statistics/centres/${params.center_host_id}${financeSummaryQuery(params.subject_filter)}`,
  );
}

/** Load shell first, then one bulk statistics request; populate rows when calculation completes. */
export async function loadFinanceCentreOfficialStatisticsProgressive(
  params: {
    examId: number;
    subject_filter: TimetableSubjectFilter;
  },
  callbacks: {
    onShellLoaded?: (shell: FinanceCentreOfficialStatisticsShellResponse) => void;
    onCalculating?: () => void;
  },
): Promise<FinanceCentreOfficialStatisticsResponse> {
  const shell = await getFinanceCentreOfficialStatisticsShell(params);
  callbacks.onShellLoaded?.(shell);
  callbacks.onCalculating?.();
  return getFinanceCentreOfficialStatistics(params);
}

export async function downloadFinanceCentreOfficialStatisticsExport(params: {
  examId: number;
  subject_filter: TimetableSubjectFilter;
  filename: string;
  examLabel: string;
  summary: FinanceCentreOfficialStatisticsResponse;
}): Promise<void> {
  await downloadApiFilePost(
    `/examinations/${params.examId}/finance/centre-official-statistics/export`,
    params.filename,
    {
      exam_label: params.examLabel,
      summary: params.summary,
    },
  );
}

export type InspectorAnalysisExportVariant = "full" | "staffing" | "pay_variance";
export type InspectorAnalysisExportStyle = "standard" | "rich";

export function inspectorAnalysisExportFilename(
  examLabel: string,
  subjectFilter: TimetableSubjectFilter,
  exportVariant: InspectorAnalysisExportVariant = "full",
  exportStyle: InspectorAnalysisExportStyle = "standard",
): string {
  const suffix =
    subjectFilter === "CORE_ONLY" ? "CORE" : subjectFilter === "ELECTIVE_ONLY" ? "ELECTIVE" : "ALL";
  const variantSuffix =
    exportVariant === "staffing" ? "staffing" : exportVariant === "pay_variance" ? "pay-variance" : "full";
  const styleSuffix = exportStyle === "rich" ? " formatted" : "";
  return `${examLabel} inspector-analysis ${suffix} ${variantSuffix}${styleSuffix}.xlsx`;
}

export const DEFAULT_INSPECTOR_CANDIDATES_RATIO = 300;
export const MAX_INSPECTOR_CANDIDATES_RATIO = 10_000;

export function parseInspectorCandidatesRatio(raw: string | null | undefined): number {
  if (raw == null || raw.trim() === "") return DEFAULT_INSPECTOR_CANDIDATES_RATIO;
  const n = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_INSPECTOR_CANDIDATES_RATIO;
  return Math.min(n, MAX_INSPECTOR_CANDIDATES_RATIO);
}

function inspectorAnalysisQuery(params: {
  subject_filter: TimetableSubjectFilter;
  candidates_per_inspector?: number;
}): string {
  const q = new URLSearchParams();
  q.set("subject_filter", params.subject_filter);
  q.set(
    "candidates_per_inspector",
    String(params.candidates_per_inspector ?? DEFAULT_INSPECTOR_CANDIDATES_RATIO),
  );
  return `?${q.toString()}`;
}

export async function getFinanceCentreInspectorAnalysis(params: {
  examId: number;
  subject_filter: TimetableSubjectFilter;
  candidates_per_inspector?: number;
}): Promise<FinanceCentreInspectorAnalysisResponse> {
  return apiJson<FinanceCentreInspectorAnalysisResponse>(
    `/examinations/${params.examId}/finance/inspector-analysis${inspectorAnalysisQuery(params)}`,
  );
}

export async function getFinanceCentreInspectorAnalysisShell(params: {
  examId: number;
  subject_filter: TimetableSubjectFilter;
}): Promise<FinanceCentreInspectorAnalysisShellResponse> {
  return apiJson<FinanceCentreInspectorAnalysisShellResponse>(
    `/examinations/${params.examId}/finance/inspector-analysis/shell${financeSummaryQuery(params.subject_filter)}`,
  );
}

export async function getFinanceCentreInspectorAnalysisForCentre(params: {
  examId: number;
  center_host_id: string;
  subject_filter: TimetableSubjectFilter;
  candidates_per_inspector?: number;
}): Promise<FinanceCentreInspectorAnalysisRow> {
  return apiJson<FinanceCentreInspectorAnalysisRow>(
    `/examinations/${params.examId}/finance/inspector-analysis/centres/${params.center_host_id}${inspectorAnalysisQuery(params)}`,
  );
}

/** Load shell first, then fetch each centre with limited parallelism. */
export async function loadFinanceCentreInspectorAnalysisProgressive(
  params: {
    examId: number;
    subject_filter: TimetableSubjectFilter;
    candidates_per_inspector?: number;
  },
  callbacks: {
    onShellLoaded?: (shell: FinanceCentreInspectorAnalysisShellResponse) => void;
    onCentreLoaded?: (row: FinanceCentreInspectorAnalysisRow) => void;
  },
): Promise<FinanceCentreInspectorAnalysisResponse> {
  const ratio = params.candidates_per_inspector ?? DEFAULT_INSPECTOR_CANDIDATES_RATIO;
  const shell = await getFinanceCentreInspectorAnalysisShell(params);
  callbacks.onShellLoaded?.(shell);

  const centres: FinanceCentreInspectorAnalysisRow[] = [];
  let index = 0;

  async function worker() {
    while (index < shell.centres.length) {
      const i = index++;
      const c = shell.centres[i]!;
      const row = normalizeInspectorAnalysisRow(
        await getFinanceCentreInspectorAnalysisForCentre({
          examId: params.examId,
          center_host_id: c.center_id,
          subject_filter: params.subject_filter,
          candidates_per_inspector: ratio,
        }),
      );
      centres.push(row);
      callbacks.onCentreLoaded?.(row);
    }
  }

  const workers = Array.from(
    { length: Math.min(FINANCE_CENTRE_FETCH_CONCURRENCY, shell.centres.length) },
    () => worker(),
  );
  await Promise.all(workers);

  centres.sort((a, b) => a.center_code.localeCompare(b.center_code) || a.center_name.localeCompare(b.center_name));

  const totals = sumInspectorAnalysisRowsFromCentres(centres, params.subject_filter);

  return normalizeInspectorAnalysisResponse({
    examination_id: params.examId,
    subject_filter: params.subject_filter,
    candidates_per_inspector: ratio,
    centres,
    totals,
  });
}

export async function downloadFinanceCentreInspectorAnalysisExport(params: {
  examId: number;
  subject_filter: TimetableSubjectFilter;
  filename: string;
  examLabel: string;
  summary: FinanceCentreInspectorAnalysisResponse;
  export_variant?: InspectorAnalysisExportVariant;
  export_style?: InspectorAnalysisExportStyle;
}): Promise<void> {
  await downloadApiFilePost(
    `/examinations/${params.examId}/finance/inspector-analysis/export`,
    params.filename,
    {
      exam_label: params.examLabel,
      summary: params.summary,
      export_variant: params.export_variant ?? "full",
      export_style: params.export_style ?? "standard",
    },
  );
}

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
  /** Timetable papers covered by this row (e.g. [1, 2] when written together). */
  covers_papers?: number[];
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

export async function adminResetDepotKeeperPassword(
  userId: string,
  payload: AdminPasswordResetPayload,
): Promise<AdminPasswordResetResponse> {
  return apiJson<AdminPasswordResetResponse>(
    `/depots/keepers/${encodeURIComponent(userId)}/reset-password`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export type ExaminerTypeApi =
  | "chief_examiner"
  | "assistant_chief_examiner"
  | "assistant_examiner"
  | "team_leader";

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
  phone_number: string | null;
  gender?: string | null;
  examiner_type: ExaminerTypeApi;
  region: string;
  reference_code: string | null;
  subject_ids: number[];
  deviation_weight: number | null;
  examiner_group_id: string | null;
  portal_url: string;
  roster_source: "manual" | "invitation";
  invitation_id?: string | null;
  invitation_status?: string | null;
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
  /** Campaign examiners eligible under cross-marking rules (may be absent on stale clients). */
  eligible_examiner_ids?: string[];
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
  phone_number: string;
  examiner_type: ExaminerTypeApi;
  region: string;
  subject_ids: [number];
  deviation_weight?: number | null;
  gender?: string | null;
};

export type ExaminerUpdatePayload = {
  name?: string;
  phone_number?: string;
  examiner_type?: ExaminerTypeApi;
  region?: string;
  subject_ids?: [number];
  deviation_weight?: number | null;
  gender?: string | null;
};

export type ExaminerInvitationStatusApi =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "quota_waitlisted";

export type ExaminerInvitationRow = {
  id: string;
  examination_id: number;
  subject_id: number;
  subject_name: string;
  subject_code: string;
  subject_original_code?: string | null;
  subject_type: SubjectTypeEnum;
  name: string;
  phone_number: string;
  gender?: string | null;
  examiner_type: ExaminerTypeApi;
  region: string;
  status: ExaminerInvitationStatusApi;
  invited_by_user_id: string | null;
  notified_at: string | null;
  responded_at: string | null;
  response_deadline: string;
  coordination_start_date: string | null;
  coordination_start_time: string | null;
  coordination_end_date: string | null;
  coordination_end_time: string | null;
  coordination_venue: string | null;
  examiner_id: string | null;
  created_at: string;
  updated_at: string;
  sms_sent?: boolean | null;
  sms_error?: string | null;
  sms_delivery_id?: string | null;
  public_url?: string | null;
};

export type ExaminerInvitationCreatePayload = {
  name: string;
  phone_number: string;
  subject_id: number;
  examiner_type: ExaminerTypeApi;
  region: string;
  gender?: string | null;
  send_sms?: boolean | null;
  response_deadline: string;
  coordination_start_date?: string | null;
  coordination_start_time?: string | null;
  coordination_end_date?: string | null;
  coordination_end_time?: string | null;
  coordination_venue?: string | null;
};

export type ExaminerInvitationCoordinationPayload = {
  coordination_start_date?: string | null;
  coordination_start_time?: string | null;
  coordination_end_date?: string | null;
  coordination_end_time?: string | null;
  coordination_venue?: string | null;
};

export type ExaminerInvitationBulkCoordinationPayload = {
  invitation_ids: string[];
} & ExaminerInvitationCoordinationPayload;

export type ExaminerInvitationBulkCoordinationResponse = {
  updated_count: number;
  errors: ExaminerInvitationBulkSmsRowError[];
};

export type ExaminerMarkingCohortPublic = {
  id: string;
  name: string;
  is_default: boolean;
  coordination_start_date: string | null;
  coordination_start_time: string | null;
  coordination_end_date: string | null;
  coordination_end_time: string | null;
  coordination_venue?: string | null;
  marking_start_date: string | null;
  marking_end_date: string | null;
  marked_script_submission_deadline: string | null;
};

export type ExaminerInvitationPublic = {
  invitee_name: string;
  phone_number: string;
  examination_id: number;
  examination_name: string;
  examination_description: string | null;
  subject_name: string;
  subject_code: string;
  subject_original_code?: string | null;
  examiner_type: string;
  examiner_type_label: string;
  region: string;
  status: ExaminerInvitationStatusApi;
  response_deadline: string | null;
  coordination_start_date: string | null;
  coordination_start_time: string | null;
  coordination_end_date: string | null;
  coordination_end_time: string | null;
  coordination_venue?: string | null;
  responded_at: string | null;
  can_respond: boolean;
  examiner_id?: string | null;
  portal_mode?: "invitation" | "roster";
  roster_source?: "manual" | "invitation" | null;
  marking_cohorts?: ExaminerMarkingCohortPublic[];
  reference_code?: string | null;
  quota_waitlist_message?: string | null;
  appointment_letters_release_enabled?: boolean;
  appointment_letters_available?: boolean;
  appointment_letters_release_mode?: AppointmentLettersReleaseMode;
  appointment_letters_release_at?: string | null;
  appointment_letters_pending_message?: string | null;
};

export type AppointmentLettersReleaseMode = "on_acceptance" | "scheduled_date";

export type ExaminerPortalSettings = {
  examination_id: number;
  appointment_letters_release_enabled: boolean;
  appointment_letters_release_mode: AppointmentLettersReleaseMode;
  appointment_letters_release_at: string | null;
  updated_at: string;
  rostered_examiner_count: number;
  pending_release_count: number;
  eligible_now_count: number;
  notified_count: number;
};

export type ExaminerPortalSettingsPut = {
  appointment_letters_release_enabled: boolean;
  appointment_letters_release_mode: AppointmentLettersReleaseMode;
  appointment_letters_release_at?: string | null;
};

export type NotifyEligibleAppointmentLettersResponse = {
  sms_sent_count: number;
  sms_failed_count: number;
  skipped_count: number;
};

export type SubjectExaminerRegionQuotaItem = {
  group_id: string;
  examiner_type?: ExaminerTypeApi | null;
  quota_count: number;
};

export type SubjectExaminerRegionQuotaSummaryRow = {
  group_id: string;
  group_name: string;
  examiner_type?: ExaminerTypeApi | null;
  examiner_type_label: string;
  current_count: number;
  quota?: number | null;
  remaining?: number | null;
};

export type ExaminerQuotaRegionGroupRow = {
  id: string;
  name: string;
  regions: string[];
};

export type ExaminationExaminerQuotaRegionGroupsResponse = {
  examination_id: number;
  groups: ExaminerQuotaRegionGroupRow[];
  regions_complete: boolean;
};

export type ExaminationExaminerQuotaRegionGroupsPut = {
  groups: Array<{
    id?: string;
    name: string;
    regions: string[];
  }>;
};

export type SubjectExaminerGenderQuotaSummaryRow = {
  gender: string;
  gender_label: string;
  current_count: number;
  quota?: number | null;
  remaining?: number | null;
};

export type SubjectExaminerRegionQuotasResponse = {
  examination_id: number;
  subject_id: number;
  total_quota?: number | null;
  male_quota?: number | null;
  female_quota?: number | null;
  roster_total: number;
  groups: ExaminerQuotaRegionGroupRow[];
  summary: SubjectExaminerRegionQuotaSummaryRow[];
  gender_summary?: SubjectExaminerGenderQuotaSummaryRow[];
  items: SubjectExaminerRegionQuotaItem[];
};

export type QuotaAssessmentResponse = {
  valid: boolean;
  violations: string[];
  row_errors: Array<{ row_number: number; message: string }>;
  summary_by_group: Array<{
    group_id: string;
    group_name: string;
    examiner_type?: string | null;
    examiner_type_label: string;
    current_count: number;
    proposed_count: number;
    combined_count: number;
    quota?: number | null;
    quota_percent?: number | null;
    remaining?: number | null;
    over_cap: boolean;
  }>;
  proposed_count: number;
  summary_by_gender?: Array<{
    gender: string;
    gender_label: string;
    current_count: number;
    proposed_count: number;
    combined_count: number;
    quota?: number | null;
    quota_percent?: number | null;
    remaining?: number | null;
    over_cap: boolean;
  }>;
};

export type ExaminerAttendanceMarkResult = {
  valid: boolean;
  recorded?: boolean;
  already_marked?: boolean;
  message: string;
  reference_code?: string | null;
  name?: string | null;
  examiner_type?: string | null;
  examiner_type_label?: string | null;
  region?: string | null;
  subject_codes?: string[];
  examiner_id?: string | null;
  examination_id?: number | null;
  examination_name?: string | null;
  attendance_date?: string | null;
};

export type ExaminerAttendanceRow = {
  id: string;
  examination_id: number;
  examiner_id: string;
  reference_code: string;
  attendance_date: string;
  examiner_name: string;
  examiner_type: string;
  examiner_type_label: string;
  region: string;
  subject_codes: string[];
  marked_at: string;
  marked_by_name?: string | null;
  examination_name?: string | null;
};

export type LunchCouponVerifyResult = {
  valid: boolean;
  message?: string | null;
  reference_code?: string | null;
  name?: string | null;
  examiner_type?: string | null;
  examiner_type_label?: string | null;
  region?: string | null;
  subject_codes?: string[] | null;
  examiner_id?: string | null;
  examination_id?: number | null;
  examination_name?: string | null;
  already_verified?: boolean;
  verified_at?: string | null;
  verified_by_name?: string | null;
  verification_date?: string | null;
  recorded?: boolean;
};

export type LunchCouponVerifiedRow = {
  examiner_id: string;
  reference_code: string;
  name: string;
  examiner_type_label: string;
  region: string;
  subject_codes: string[];
  verified_at: string;
  verification_date: string;
  verified_by_name?: string | null;
  examination_id?: number | null;
  examination_name?: string | null;
};

export type LunchCouponVerifiedList = {
  items: LunchCouponVerifiedRow[];
  total: number;
};

export type ExaminerPublicScriptsAllocationRow = {
  school_code: string;
  school_name: string;
  envelope_number: number;
  series_number: number;
  booklet_count: number;
};

export type ExaminerPublicScriptsAllocationBlock = {
  subject_code: string;
  subject_name: string;
  paper_number: number;
  rows: ExaminerPublicScriptsAllocationRow[];
  total_booklets: number;
};

export type ExaminerPublicScriptsAllocation = {
  blocks: ExaminerPublicScriptsAllocationBlock[];
};

export type ExaminerInvitationActionResult = {
  status: ExaminerInvitationStatusApi;
  message: string;
  examiner_id: string | null;
};

export type ExaminerBankAccountPublic = {
  id: string;
  examiner_id: string;
  bank_branch_id: string;
  bank_code: string;
  bank_name: string;
  branch_name: string;
  account_number: string;
  created_at: string;
  updated_at: string;
};

export type ExaminerBankAccountUpsertPayload = {
  bank_branch_id: string;
  account_number: string;
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

export type ExaminerRegionGroupRow = {
  id: string | null;
  name: string;
  code_prefix: string;
  regions: string[];
};

export type ExaminationExaminerRegionGroupsResponse = {
  examination_id: number;
  groups: ExaminerRegionGroupRow[];
  regions_complete: boolean;
  roster_total: number;
  with_code_count: number;
  missing_code_count: number;
};

export type ExaminerReferenceCodesActionResponse = {
  examination_id: number;
  assigned_count: number;
  skipped_count: number;
  roster_total: number;
};

export type ExaminationExaminerRegionGroupsPut = {
  groups: Array<{
    name: string;
    code_prefix: string;
    regions: string[];
  }>;
};

export type AllocationExaminerRow = {
  allocation_id: string;
  examiner_id: string;
  examiner_name: string;
  reference_code: string | null;
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

export async function getExaminationExaminerRegionGroups(
  examinationId: number,
): Promise<ExaminationExaminerRegionGroupsResponse> {
  return apiJson<ExaminationExaminerRegionGroupsResponse>(
    `/admin/examinations/${examinationId}/examiner-region-groups`,
  );
}

export async function putExaminationExaminerRegionGroups(
  examinationId: number,
  payload: ExaminationExaminerRegionGroupsPut,
): Promise<ExaminationExaminerRegionGroupsResponse> {
  return apiJson<ExaminationExaminerRegionGroupsResponse>(
    `/admin/examinations/${examinationId}/examiner-region-groups`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function getExaminationExaminerQuotaRegionGroups(
  examinationId: number,
): Promise<ExaminationExaminerQuotaRegionGroupsResponse> {
  return apiJson<ExaminationExaminerQuotaRegionGroupsResponse>(
    `/admin/examinations/${examinationId}/examiner-quota-region-groups`,
  );
}

export async function putExaminationExaminerQuotaRegionGroups(
  examinationId: number,
  payload: ExaminationExaminerQuotaRegionGroupsPut,
): Promise<ExaminationExaminerQuotaRegionGroupsResponse> {
  return apiJson<ExaminationExaminerQuotaRegionGroupsResponse>(
    `/admin/examinations/${examinationId}/examiner-quota-region-groups`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function generateExaminerReferenceCodes(
  examinationId: number,
): Promise<ExaminerReferenceCodesActionResponse> {
  return apiJson<ExaminerReferenceCodesActionResponse>(
    `/admin/examinations/${examinationId}/examiner-reference-codes/generate`,
    { method: "POST" },
  );
}

export async function getSubjectExaminerRegionQuotas(
  examinationId: number,
  subjectId: number,
): Promise<SubjectExaminerRegionQuotasResponse> {
  return apiJson<SubjectExaminerRegionQuotasResponse>(
    `/admin/examinations/${examinationId}/subjects/${subjectId}/examiner-region-quotas`,
  );
}

export async function putSubjectExaminerRegionQuotas(
  examinationId: number,
  subjectId: number,
  payload: {
    total_quota: number | null;
    male_quota?: number | null;
    female_quota?: number | null;
    items: SubjectExaminerRegionQuotaItem[];
  },
): Promise<SubjectExaminerRegionQuotasResponse> {
  return apiJson<SubjectExaminerRegionQuotasResponse>(
    `/admin/examinations/${examinationId}/subjects/${subjectId}/examiner-region-quotas`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function assessExaminerQuotaUpload(
  examinationId: number,
  subjectId: number,
  file: File,
): Promise<QuotaAssessmentResponse> {
  const form = new FormData();
  form.append("file", file);
  return apiJson<QuotaAssessmentResponse>(
    `/examinations/${examinationId}/subjects/${subjectId}/examiner-quota-assessment`,
    { method: "POST", body: form },
  );
}

export async function listExaminerAttendance(
  examinationId: number,
  options?: { admin?: boolean },
): Promise<{ items: ExaminerAttendanceRow[]; total: number }> {
  const base = options?.admin
    ? `/admin/examinations/${examinationId}/examiner-attendance`
    : `/examinations/${examinationId}/subject-officer/examiner-attendance`;
  return apiJson(base);
}

export async function listExaminerAttendanceAll(
  options?: { admin?: boolean; examinationId?: number; subjectId?: number },
): Promise<{ items: ExaminerAttendanceRow[]; total: number }> {
  if (options?.admin) {
    const params = new URLSearchParams();
    if (options.examinationId != null) params.set("examination_id", String(options.examinationId));
    if (options.subjectId != null) params.set("subject_id", String(options.subjectId));
    const qs = params.toString();
    return apiJson(`/admin/examiner-attendance${qs ? `?${qs}` : ""}`);
  }
  return apiJson("/subject-officer/examiner-attendance");
}

export async function markExaminerAttendance(
  examinationId: number,
  referenceCode: string,
  options?: { admin?: boolean },
): Promise<ExaminerAttendanceMarkResult> {
  const base = options?.admin
    ? `/admin/examinations/${examinationId}/examiner-attendance/mark`
    : `/examinations/${examinationId}/subject-officer/examiner-attendance/mark`;
  return apiJson<ExaminerAttendanceMarkResult>(base, {
    method: "POST",
    body: JSON.stringify({ reference_code: referenceCode }),
  });
}

export async function markExaminerAttendanceScan(
  referenceCode: string,
  options?: { admin?: boolean },
): Promise<ExaminerAttendanceMarkResult> {
  const base = options?.admin
    ? "/admin/examiner-attendance/mark-scan"
    : "/subject-officer/examiner-attendance/mark-scan";
  return apiJson<ExaminerAttendanceMarkResult>(base, {
    method: "POST",
    body: JSON.stringify({ reference_code: referenceCode }),
  });
}

export async function regenerateExaminerReferenceCodes(
  examinationId: number,
): Promise<ExaminerReferenceCodesActionResponse> {
  return apiJson<ExaminerReferenceCodesActionResponse>(
    `/admin/examinations/${examinationId}/examiner-reference-codes/regenerate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    },
  );
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

export async function listExaminerInvitations(examinationId: number): Promise<ExaminerInvitationRow[]> {
  return apiJson<ExaminerInvitationRow[]>(`/examinations/${examinationId}/examiner-invitations`);
}

export async function createExaminerInvitation(
  examinationId: number,
  payload: ExaminerInvitationCreatePayload,
): Promise<ExaminerInvitationRow> {
  return apiJson<ExaminerInvitationRow>(`/examinations/${examinationId}/examiner-invitations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function downloadExaminerInvitationsBulkTemplate(examinationId: number): Promise<void> {
  await downloadApiFile(
    `/examinations/${examinationId}/examiner-invitations/bulk-upload/template`,
    "examiner_invitations_bulk_template.xlsx",
  );
}

export type ExaminerInvitationBulkImportRowError = {
  row_number: number;
  message: string;
};

export type ExaminerInvitationBulkImportResponse = {
  created_count: number;
  sms_sent_count: number;
  sms_failed_count: number;
  errors: ExaminerInvitationBulkImportRowError[];
};

export type ExaminerInvitationBulkSmsRowError = {
  invitation_id: string;
  message: string;
};

export type ExaminerInvitationBulkSmsResponse = {
  sent_count: number;
  failed_count: number;
  errors: ExaminerInvitationBulkSmsRowError[];
};

export type ExaminerInvitationBulkSmsPayload = {
  invitation_ids: string[];
  message: string;
};

export type ExaminerRosterBulkSmsRowError = {
  examiner_id: string;
  message: string;
};

export type ExaminerRosterBulkSmsResponse = {
  sent_count: number;
  failed_count: number;
  errors: ExaminerRosterBulkSmsRowError[];
};

export type ExaminerRosterBulkSmsPayload = {
  examiner_ids: string[];
  message: string;
};

export type ExaminerInvitationBulkUploadOptions = {
  sendSms?: boolean;
  responseDeadline: string;
  coordinationStartDate?: string | null;
  coordinationStartTime?: string | null;
  coordinationEndDate?: string | null;
  coordinationEndTime?: string | null;
};

export async function bulkUploadExaminerInvitations(
  examinationId: number,
  file: File,
  options: ExaminerInvitationBulkUploadOptions,
): Promise<ExaminerInvitationBulkImportResponse> {
  const q = new URLSearchParams();
  q.set("response_deadline", options.responseDeadline);
  if (options.sendSms) q.set("send_sms", "true");
  if (options.coordinationStartDate) q.set("coordination_start_date", options.coordinationStartDate);
  if (options.coordinationStartTime) q.set("coordination_start_time", options.coordinationStartTime);
  if (options.coordinationEndDate) q.set("coordination_end_date", options.coordinationEndDate);
  if (options.coordinationEndTime) q.set("coordination_end_time", options.coordinationEndTime);
  const formData = new FormData();
  formData.append("file", file);
  const qs = q.toString();
  return apiJson<ExaminerInvitationBulkImportResponse>(
    `/examinations/${examinationId}/examiner-invitations/bulk-upload${qs ? `?${qs}` : ""}`,
    { method: "POST", body: formData },
  );
}

export async function resendExaminerInvitationSms(
  examinationId: number,
  invitationId: string,
): Promise<{ sms_sent: boolean; sms_error: string | null; sms_delivery_id: string | null }> {
  return apiJson(`/examinations/${examinationId}/examiner-invitations/${invitationId}/resend`, {
    method: "POST",
  });
}

export type ExaminerInvitationRenewPayload = {
  response_deadline: string;
  send_sms?: boolean | null;
};

export type ExaminerInvitationRenewResponse = {
  invitation: ExaminerInvitationRow;
  sms_sent: boolean | null;
  sms_error: string | null;
  sms_delivery_id: string | null;
};

export async function renewExaminerInvitation(
  examinationId: number,
  invitationId: string,
  payload: ExaminerInvitationRenewPayload,
): Promise<ExaminerInvitationRenewResponse> {
  return apiJson<ExaminerInvitationRenewResponse>(
    `/examinations/${examinationId}/examiner-invitations/${invitationId}/renew`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export type ExaminerInvitationResponseDeadlinePayload = {
  response_deadline: string;
  send_sms?: boolean | null;
};

export type ExaminerInvitationResponseDeadlineUpdateResponse = {
  invitation: ExaminerInvitationRow;
  sms_sent: boolean | null;
  sms_error: string | null;
  sms_delivery_id: string | null;
};

export async function updateExaminerInvitationResponseDeadline(
  examinationId: number,
  invitationId: string,
  payload: ExaminerInvitationResponseDeadlinePayload,
): Promise<ExaminerInvitationResponseDeadlineUpdateResponse> {
  return apiJson<ExaminerInvitationResponseDeadlineUpdateResponse>(
    `/examinations/${examinationId}/examiner-invitations/${invitationId}/response-deadline`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function bulkSendExaminerInvitationCustomSms(
  examinationId: number,
  payload: ExaminerInvitationBulkSmsPayload,
): Promise<ExaminerInvitationBulkSmsResponse> {
  return apiJson<ExaminerInvitationBulkSmsResponse>(
    `/examinations/${examinationId}/examiner-invitations/bulk-sms`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function updateExaminerInvitationCoordinationSchedule(
  examinationId: number,
  invitationId: string,
  payload: ExaminerInvitationCoordinationPayload,
): Promise<ExaminerInvitationRow> {
  return apiJson<ExaminerInvitationRow>(
    `/examinations/${examinationId}/examiner-invitations/${encodeURIComponent(invitationId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function bulkSetExaminerInvitationCoordinationSchedule(
  examinationId: number,
  payload: ExaminerInvitationBulkCoordinationPayload,
): Promise<ExaminerInvitationBulkCoordinationResponse> {
  return apiJson<ExaminerInvitationBulkCoordinationResponse>(
    `/examinations/${examinationId}/examiner-invitations/bulk-coordination-date`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
}

export async function bulkSendExaminerRosterCustomSms(
  examinationId: number,
  payload: ExaminerRosterBulkSmsPayload,
): Promise<ExaminerRosterBulkSmsResponse> {
  return apiJson<ExaminerRosterBulkSmsResponse>(`/examinations/${examinationId}/examiners/bulk-sms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function getPublicExaminerInvitation(token: string): Promise<ExaminerInvitationPublic> {
  return publicApiJson<ExaminerInvitationPublic>(`/public/examiner-invitations/${encodeURIComponent(token)}`);
}

export async function acceptPublicExaminerInvitation(token: string): Promise<ExaminerInvitationActionResult> {
  return publicApiJson<ExaminerInvitationActionResult>(
    `/public/examiner-invitations/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );
}

export async function declinePublicExaminerInvitation(token: string): Promise<ExaminerInvitationActionResult> {
  return publicApiJson<ExaminerInvitationActionResult>(
    `/public/examiner-invitations/${encodeURIComponent(token)}/decline`,
    { method: "POST" },
  );
}

export async function getPublicExaminerBankAccount(
  token: string,
): Promise<ExaminerBankAccountPublic | null> {
  const url = `${getApiBaseUrl()}/public/examiner-invitations/${encodeURIComponent(token)}/bank-account`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    if (e instanceof TypeError) {
      throw new Error(apiNetworkErrorMessage());
    }
    throw e;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return (await res.json()) as ExaminerBankAccountPublic;
}

export async function upsertPublicExaminerBankAccount(
  token: string,
  payload: ExaminerBankAccountUpsertPayload,
): Promise<ExaminerBankAccountPublic> {
  return publicApiJson<ExaminerBankAccountPublic>(
    `/public/examiner-invitations/${encodeURIComponent(token)}/bank-account`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function listPublicBankBranches(
  token: string,
  params?: {
    bank_name?: string | null;
    bank_name_exact?: string | null;
    branch_name?: string | null;
    skip?: number;
    limit?: number;
  },
): Promise<BankBranchListResponse> {
  const q = new URLSearchParams();
  if (params?.bank_name_exact?.trim()) q.set("bank_name_exact", params.bank_name_exact.trim());
  else if (params?.bank_name?.trim()) q.set("bank_name", params.bank_name.trim());
  if (params?.branch_name?.trim()) q.set("branch_name", params.branch_name.trim());
  if (params?.skip != null) q.set("skip", String(params.skip));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return publicApiJson<BankBranchListResponse>(
    `/public/examiner-invitations/${encodeURIComponent(token)}/bank-branches${s ? `?${s}` : ""}`,
  );
}

export async function getPublicDistinctBankNames(
  token: string,
  q?: string | null,
): Promise<string[]> {
  const u = new URLSearchParams();
  if (q?.trim()) u.set("q", q.trim());
  const s = u.toString();
  return publicApiJson<string[]>(
    `/public/examiner-invitations/${encodeURIComponent(token)}/bank-names${s ? `?${s}` : ""}`,
  );
}

export async function getPublicExaminerScriptsAllocation(
  token: string,
): Promise<ExaminerPublicScriptsAllocation> {
  return publicApiJson<ExaminerPublicScriptsAllocation>(
    `/public/examiner-invitations/${encodeURIComponent(token)}/scripts-allocation`,
  );
}

export async function downloadPublicApiFile(path: string, filename: string): Promise<void> {
  const res = await publicApiFetch(path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function downloadPublicExaminerAppointmentLetterPdf(
  token: string,
  filename = "appointment_letter.pdf",
): Promise<void> {
  await downloadPublicApiFile(
    `/public/examiner-invitations/${encodeURIComponent(token)}/appointment-letter.pdf`,
    filename,
  );
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

export type AttendanceSheet = {
  id: string;
  examination_id: number;
  inspector_exam_posting_id: string;
  center_id: string;
  center_code: string;
  center_name: string;
  subject_scope: RecordSubjectScope;
  examination_date: string;
  notes: string | null;
  original_filename: string;
  size_bytes: number;
  uploaded_by_id: string | null;
  created_at: string;
};

export type AttendanceSheetListResponse = {
  items: AttendanceSheet[];
  total: number;
};

export type AttendanceScheduledDateItem = {
  examination_date: string;
  subject_scopes: RecordSubjectScope[];
};

export type AttendanceSheetScheduledDatesResponse = {
  dates: AttendanceScheduledDateItem[];
  today: string;
};

export type AttendanceSheetAdmin = AttendanceSheet & {
  inspector_user_id: string;
  inspector_full_name: string;
  inspector_phone: string | null;
};

export type AttendanceSheetAdminListResponse = {
  items: AttendanceSheetAdmin[];
  total: number;
  page: number;
  page_size: number;
};

export type AttendanceSheetAdminSummary = {
  total_uploads: number;
  centres_with_uploads: number;
  centres_expected: number | null;
  centres_missing: number | null;
};

export type AttendanceCentreComplianceItem = {
  center_id: string;
  center_code: string;
  center_name: string;
  inspector_user_id: string;
  inspector_full_name: string;
  inspector_phone: string | null;
  subject_scope: RecordSubjectScope;
  file_count: number;
  upload_status: "uploaded" | "missing" | "not_due";
};

export type AttendanceCentreComplianceListResponse = {
  items: AttendanceCentreComplianceItem[];
  total: number;
};

export type AttendanceUploadStatusFilter = "all" | "uploaded" | "missing";

function attendanceSheetsPostingQuery(postingId?: string | null): string {
  const q = new URLSearchParams();
  if (postingId?.trim()) q.set("posting_id", postingId.trim());
  const s = q.toString();
  return s ? `?${s}` : "";
}

export async function getInspectorAttendanceScheduledDates(
  examId: number,
  postingId?: string | null,
): Promise<AttendanceSheetScheduledDatesResponse> {
  return apiJson<AttendanceSheetScheduledDatesResponse>(
    `/examinations/${examId}/attendance-sheets/scheduled-dates${attendanceSheetsPostingQuery(postingId)}`,
  );
}

export async function listInspectorAttendanceSheets(
  examId: number,
  options?: { postingId?: string | null; examinationDate?: string | null },
): Promise<AttendanceSheetListResponse> {
  const q = new URLSearchParams();
  if (options?.postingId?.trim()) q.set("posting_id", options.postingId.trim());
  if (options?.examinationDate?.trim()) q.set("examination_date", options.examinationDate.trim());
  const s = q.toString();
  return apiJson<AttendanceSheetListResponse>(
    `/examinations/${examId}/attendance-sheets${s ? `?${s}` : ""}`,
  );
}

export async function uploadInspectorAttendanceSheet(
  examId: number,
  examinationDate: string,
  file: File,
  options?: {
    notes?: string | null;
    postingId?: string | null;
    subjectScope?: RecordSubjectScope | null;
  },
): Promise<AttendanceSheet> {
  const token = getStoredToken();
  if (!token) throw new Error("Not authenticated");

  const formData = new FormData();
  formData.append("examination_date", examinationDate);
  if (options?.subjectScope) {
    formData.append("subject_scope", options.subjectScope);
  }
  if (options?.notes != null && options.notes.trim() !== "") {
    formData.append("notes", options.notes.trim());
  }
  formData.append("file", file);

  const q = attendanceSheetsPostingQuery(options?.postingId);
  const res = await fetch(`${getApiBaseUrl()}/examinations/${examId}/attendance-sheets${q}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  await assertAuthedResponse(res);
  return (await res.json()) as AttendanceSheet;
}

export async function downloadInspectorAttendanceSheet(
  examId: number,
  sheet: AttendanceSheet,
  postingId?: string | null,
): Promise<void> {
  await downloadApiFile(
    `/examinations/${examId}/attendance-sheets/${sheet.id}/file${attendanceSheetsPostingQuery(postingId)}`,
    sheet.original_filename,
  );
}

export async function deleteInspectorAttendanceSheet(
  examId: number,
  sheetId: string,
  postingId?: string | null,
): Promise<void> {
  await apiFetch(
    `/examinations/${examId}/attendance-sheets/${sheetId}${attendanceSheetsPostingQuery(postingId)}`,
    { method: "DELETE" },
  );
}

export async function getAdminAttendanceScheduledDates(
  examId: number,
): Promise<AttendanceSheetScheduledDatesResponse> {
  return apiJson<AttendanceSheetScheduledDatesResponse>(
    `/admin/examinations/${examId}/attendance-sheets/scheduled-dates`,
  );
}

export async function getAdminAttendanceSheetSummary(
  examId: number,
  params?: { examinationDate?: string | null; search?: string | null },
): Promise<AttendanceSheetAdminSummary> {
  const q = new URLSearchParams();
  if (params?.examinationDate?.trim()) q.set("examination_date", params.examinationDate.trim());
  if (params?.search?.trim()) q.set("q", params.search.trim());
  const s = q.toString();
  return apiJson<AttendanceSheetAdminSummary>(
    `/admin/examinations/${examId}/attendance-sheets/summary${s ? `?${s}` : ""}`,
  );
}

export async function listAdminAttendanceUploadCentres(
  examId: number,
  params?: {
    examinationDate?: string | null;
    subjectScope?: RecordSubjectScope | null;
    search?: string | null;
  },
): Promise<AttendanceCentreComplianceListResponse> {
  const q = new URLSearchParams();
  if (params?.examinationDate?.trim()) q.set("examination_date", params.examinationDate.trim());
  if (params?.subjectScope) q.set("subject_scope", params.subjectScope);
  if (params?.search?.trim()) q.set("q", params.search.trim());
  const s = q.toString();
  return apiJson<AttendanceCentreComplianceListResponse>(
    `/admin/examinations/${examId}/attendance-sheets/upload-centres${s ? `?${s}` : ""}`,
  );
}

export async function listAdminAttendanceComplianceCentres(
  examId: number,
  params: {
    examinationDate: string;
    uploadStatus?: AttendanceUploadStatusFilter;
    search?: string | null;
  },
): Promise<AttendanceCentreComplianceListResponse> {
  const q = new URLSearchParams();
  q.set("examination_date", params.examinationDate.trim());
  if (params.uploadStatus && params.uploadStatus !== "all") {
    q.set("upload_status", params.uploadStatus);
  }
  if (params.search?.trim()) q.set("q", params.search.trim());
  return apiJson<AttendanceCentreComplianceListResponse>(
    `/admin/examinations/${examId}/attendance-sheets/compliance-centres?${q.toString()}`,
  );
}

export async function listAdminAttendanceSheets(
  examId: number,
  params?: {
    page?: number;
    pageSize?: number;
    centerId?: string | null;
    examinationDate?: string | null;
    subjectScope?: RecordSubjectScope | null;
    inspectorUserId?: string | null;
    search?: string | null;
  },
): Promise<AttendanceSheetAdminListResponse> {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.pageSize != null) q.set("page_size", String(params.pageSize));
  if (params?.centerId?.trim()) q.set("center_id", params.centerId.trim());
  if (params?.examinationDate?.trim()) q.set("examination_date", params.examinationDate.trim());
  if (params?.subjectScope) q.set("subject_scope", params.subjectScope);
  if (params?.inspectorUserId?.trim()) q.set("inspector_user_id", params.inspectorUserId.trim());
  if (params?.search?.trim()) q.set("q", params.search.trim());
  const s = q.toString();
  return apiJson<AttendanceSheetAdminListResponse>(
    `/admin/examinations/${examId}/attendance-sheets${s ? `?${s}` : ""}`,
  );
}

export async function downloadAdminAttendanceSheet(
  examId: number,
  sheet: AttendanceSheetAdmin | AttendanceSheet,
): Promise<void> {
  await downloadApiFile(
    `/admin/examinations/${examId}/attendance-sheets/${sheet.id}/file`,
    sheet.original_filename,
  );
}

export async function downloadAdminAttendanceSheetsZip(
  examId: number,
  params: {
    centerId: string;
    subjectScope?: RecordSubjectScope | null;
    examinationDate?: string | null;
    search?: string | null;
  },
  filename: string,
): Promise<void> {
  const q = new URLSearchParams();
  q.set("center_id", params.centerId);
  if (params.subjectScope) q.set("subject_scope", params.subjectScope);
  if (params.examinationDate?.trim()) q.set("examination_date", params.examinationDate.trim());
  if (params.search?.trim()) q.set("q", params.search.trim());
  await downloadApiFile(
    `/admin/examinations/${examId}/attendance-sheets/download-zip?${q.toString()}`,
    filename,
  );
}

/** Fetch attendance sheet bytes for in-browser preview. Caller must revoke blob URLs. */
export async function fetchAdminAttendanceSheetBlob(
  examId: number,
  sheetId: string,
): Promise<Blob> {
  const res = await apiFetch(`/admin/examinations/${examId}/attendance-sheets/${sheetId}/file`);
  return res.blob();
}

export type AdminSubjectOfficerRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  is_active: boolean;
  created_at: string;
};

export type AdminSubjectOfficerListResponse = {
  items: AdminSubjectOfficerRow[];
  total: number;
};

export type AdminSubjectOfficerCreatePayload = {
  email: string;
  password: string;
  full_name: string;
  phone_number?: string | null;
  send_sms?: boolean | null;
};

export type AdminSubjectOfficerCreatedResponse = {
  id: string;
  full_name: string;
  email: string;
  phone_number?: string | null;
  sms_sent?: boolean | null;
  sms_error?: string | null;
};

export type SubjectOfficerAssignmentSubjectRow = {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_type: string;
  subject_original_code?: string | null;
};

export type SubjectOfficerAssignmentRow = {
  id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  subject_ids: number[];
  subjects: SubjectOfficerAssignmentSubjectRow[];
};

export type SubjectOfficerAssignmentListResponse = {
  items: SubjectOfficerAssignmentRow[];
};

export type SubjectOfficerMeAssignmentSubject = {
  assignment_id: string;
  subject_id: number;
  subject_code: string;
  subject_name: string;
  subject_type: string;
  subject_original_code?: string | null;
};

export type SubjectOfficerMeExamAssignment = {
  examination_id: number;
  examination_name: string;
  subjects: SubjectOfficerMeAssignmentSubject[];
};

export type SubjectOfficerMeAssignmentsResponse = {
  items: SubjectOfficerMeExamAssignment[];
};

export type MarkedScriptReturnRow = {
  allocation_assignment_id: string;
  examiner_id: string;
  examiner_name: string;
  examiner_type: string;
  paper_number: number;
  allocation_run_id: string;
  school_code: string;
  school_name: string;
  envelope_number: number;
  series_number: number;
  expected_booklets: number;
  returned_booklets: number | null;
  status: string;
  verified_at: string | null;
  notes: string | null;
};

export type MarkedScriptReturnExaminerOption = {
  examiner_id: string;
  examiner_name: string;
  examiner_type: string;
  region: string;
  phone_number: string | null;
  pending_count: number;
  verified_count: number;
};

export type MarkedScriptReturnPaperOption = {
  paper_number: number;
  pending_count: number;
  verified_count: number;
};

export type MarkedScriptReturnFiltersResponse = {
  examiners: MarkedScriptReturnExaminerOption[];
  papers: MarkedScriptReturnPaperOption[];
};

export type MarkedScriptReturnGridResponse = {
  subject_id: number;
  subject_code: string;
  subject_name: string;
  examiner_id: string;
  examiner_name: string;
  examiner_type: string;
  paper_number: number;
  marking_group_id?: string | null;
  marking_group_name?: string | null;
  coordination_start_date?: string | null;
  coordination_start_time?: string | null;
  coordination_end_date?: string | null;
  coordination_end_time?: string | null;
  marking_start_date?: string | null;
  marking_end_date?: string | null;
  marked_script_submission_deadline?: string | null;
  rows: MarkedScriptReturnRow[];
  summary: Record<string, number>;
};

export type SubjectMarkingGroupSchedulePayload = {
  coordination_start_date?: string | null;
  coordination_start_time?: string | null;
  coordination_end_date?: string | null;
  coordination_end_time?: string | null;
  coordination_venue?: string | null;
  marking_start_date?: string | null;
  marking_end_date?: string | null;
  marked_script_submission_deadline?: string | null;
};

export type SubjectMarkingGroupRow = {
  id: string;
  examination_id: number;
  subject_id: number;
  name: string;
  is_default?: boolean;
  examiner_ids: string[];
  source_regions: string[];
  source_roles: string[];
  coordination_start_date: string | null;
  coordination_start_time: string | null;
  coordination_end_date: string | null;
  coordination_end_time: string | null;
  coordination_venue: string | null;
  marking_start_date: string | null;
  marking_end_date: string | null;
  marked_script_submission_deadline: string | null;
  created_at: string;
  updated_at: string;
};

export type ExaminerAppointmentLetterReferenceSubjectRef = {
  id: number;
  code: string;
  name: string;
  subject_type: string;
};

export type ExaminerAppointmentLetterReferenceItem = {
  subject_id: number;
  examiner_type: ExaminerTypeApi;
  reference_number: string | null;
};

export type ExaminationExaminerAppointmentLetterReferencesResponse = {
  examination_id: number;
  subjects: ExaminerAppointmentLetterReferenceSubjectRef[];
  items: ExaminerAppointmentLetterReferenceItem[];
};

export type ExaminerAppointmentLetterReferencePutCell = {
  subject_id: number;
  examiner_type: ExaminerTypeApi;
  reference_number: string | null;
};

export async function getExaminerPortalSettings(examinationId: number): Promise<ExaminerPortalSettings> {
  return apiJson<ExaminerPortalSettings>(`/admin/examinations/${examinationId}/examiner-portal-settings`);
}

export async function putExaminerPortalSettings(
  examinationId: number,
  body: ExaminerPortalSettingsPut,
): Promise<ExaminerPortalSettings> {
  return apiJson<ExaminerPortalSettings>(`/admin/examinations/${examinationId}/examiner-portal-settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function notifyEligibleAppointmentLetters(
  examinationId: number,
): Promise<NotifyEligibleAppointmentLettersResponse> {
  return apiJson<NotifyEligibleAppointmentLettersResponse>(
    `/admin/examinations/${examinationId}/examiner-portal-settings/notify-eligible-appointment-letters`,
    { method: "POST" },
  );
}

export async function getExaminerAppointmentLetterReferences(
  examinationId: number,
): Promise<ExaminationExaminerAppointmentLetterReferencesResponse> {
  return apiJson<ExaminationExaminerAppointmentLetterReferencesResponse>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-references`,
  );
}

export async function putExaminerAppointmentLetterReferences(
  examinationId: number,
  items: ExaminerAppointmentLetterReferencePutCell[],
): Promise<ExaminationExaminerAppointmentLetterReferencesResponse> {
  return apiJson<ExaminationExaminerAppointmentLetterReferencesResponse>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-references`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    },
  );
}

export async function downloadExaminerAppointmentLetterPreviewPdf(
  examinationId: number,
  subjectId: number,
  examinerType: ExaminerTypeApi,
  filename = "appointment_letter_preview.pdf",
): Promise<void> {
  const q = new URLSearchParams({
    subject_id: String(subjectId),
    examiner_type: examinerType,
  });
  await downloadApiFile(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-preview.pdf?${q.toString()}`,
    filename,
  );
}

export type AppointmentLetterSigningOfficial =
  | "director_general"
  | "director_assessment_certification";

export type AppointmentLetterSignatureRole =
  | "director_general"
  | "director_assessment_certification";

export type AppointmentLetterSignatureMeta = {
  has_signature: boolean;
  content_type: string | null;
};

export type ExaminerAppointmentLetterSettings = {
  examination_id: number;
  signing_official: AppointmentLetterSigningOfficial;
  signed_for_director_general: boolean;
  director_general_name: string;
  director_general_title: string;
  director_assessment_name: string;
  director_assessment_title: string;
  valediction: string;
  letter_date: string | null;
  cc_lines: string[];
  director_general_signature: AppointmentLetterSignatureMeta;
  director_assessment_signature: AppointmentLetterSignatureMeta;
  updated_at: string | null;
};

export type ExaminerAppointmentLetterSettingsCopyFromResponse = {
  examination_id: number;
  source_examination_id: number;
  cc_lines_copied: number;
  signatures_copied: number;
  subject_settings_copied: number;
};

export type ExaminerAppointmentLetterSubjectSettings = {
  examination_id: number;
  subject_id: number;
  director_assessment_name: string;
  director_assessment_title: string;
  director_assessment_signature: AppointmentLetterSignatureMeta;
  uses_exam_default_name: boolean;
  uses_exam_default_title: boolean;
  uses_exam_default_signature: boolean;
  updated_at: string | null;
};

export async function getExaminerAppointmentLetterSubjectSettings(
  examinationId: number,
  subjectId: number,
): Promise<ExaminerAppointmentLetterSubjectSettings> {
  return apiJson<ExaminerAppointmentLetterSubjectSettings>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-subject-settings/${subjectId}`,
  );
}

export async function putExaminerAppointmentLetterSubjectSettings(
  examinationId: number,
  subjectId: number,
  body: Pick<ExaminerAppointmentLetterSubjectSettings, "director_assessment_name" | "director_assessment_title">,
): Promise<ExaminerAppointmentLetterSubjectSettings> {
  return apiJson<ExaminerAppointmentLetterSubjectSettings>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-subject-settings/${subjectId}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function uploadExaminerAppointmentLetterSubjectSignature(
  examinationId: number,
  subjectId: number,
  file: File,
): Promise<ExaminerAppointmentLetterSubjectSettings> {
  const form = new FormData();
  form.append("file", file);
  return apiJson<ExaminerAppointmentLetterSubjectSettings>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-subject-settings/${subjectId}/signatures/director_assessment_certification`,
    { method: "POST", body: form },
  );
}

export async function deleteExaminerAppointmentLetterSubjectSignature(
  examinationId: number,
  subjectId: number,
): Promise<ExaminerAppointmentLetterSubjectSettings> {
  return apiJson<ExaminerAppointmentLetterSubjectSettings>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-subject-settings/${subjectId}/signatures/director_assessment_certification`,
    { method: "DELETE" },
  );
}

export async function fetchExaminerAppointmentLetterSubjectSignatureBlobUrl(
  examinationId: number,
  subjectId: number,
): Promise<string> {
  const res = await apiFetch(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-subject-settings/${subjectId}/signatures/director_assessment_certification`,
  );
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function getExaminerAppointmentLetterSettings(
  examinationId: number,
): Promise<ExaminerAppointmentLetterSettings> {
  return apiJson<ExaminerAppointmentLetterSettings>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-settings`,
  );
}

export async function putExaminerAppointmentLetterSettings(
  examinationId: number,
  body: Omit<ExaminerAppointmentLetterSettings, "examination_id" | "director_general_signature" | "director_assessment_signature" | "updated_at">,
): Promise<ExaminerAppointmentLetterSettings> {
  return apiJson<ExaminerAppointmentLetterSettings>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-settings`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

export async function copyExaminerAppointmentLetterSettingsFrom(
  examinationId: number,
  sourceExaminationId: number,
): Promise<ExaminerAppointmentLetterSettingsCopyFromResponse> {
  return apiJson<ExaminerAppointmentLetterSettingsCopyFromResponse>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-settings/copy-from`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_examination_id: sourceExaminationId }),
    },
  );
}

export async function uploadExaminerAppointmentLetterSignature(
  examinationId: number,
  role: AppointmentLetterSignatureRole,
  file: File,
): Promise<ExaminerAppointmentLetterSettings> {
  const body = new FormData();
  body.append("file", file);
  return apiJson<ExaminerAppointmentLetterSettings>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-settings/signatures/${role}`,
    { method: "POST", body },
  );
}

export async function deleteExaminerAppointmentLetterSignature(
  examinationId: number,
  role: AppointmentLetterSignatureRole,
): Promise<ExaminerAppointmentLetterSettings> {
  return apiJson<ExaminerAppointmentLetterSettings>(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-settings/signatures/${role}`,
    { method: "DELETE" },
  );
}

export async function fetchExaminerAppointmentLetterSignatureBlobUrl(
  examinationId: number,
  role: AppointmentLetterSignatureRole,
): Promise<string> {
  const res = await apiFetch(
    `/admin/examinations/${examinationId}/examiner-appointment-letter-settings/signatures/${role}`,
  );
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function listSubjectMarkingGroups(
  examinationId: number,
  subjectId: number,
): Promise<SubjectMarkingGroupRow[]> {
  return apiJson<SubjectMarkingGroupRow[]>(
    `/examinations/${examinationId}/subject-officer/marking-groups?subject_id=${subjectId}`,
  );
}

export async function createSubjectMarkingGroup(
  examinationId: number,
  subjectId: number,
  payload: {
    name: string;
  } & SubjectMarkingGroupSchedulePayload,
): Promise<SubjectMarkingGroupRow> {
  return apiJson<SubjectMarkingGroupRow>(
    `/examinations/${examinationId}/subject-officer/marking-groups?subject_id=${subjectId}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function updateSubjectMarkingGroup(
  examinationId: number,
  subjectId: number,
  groupId: string,
  payload: {
    name?: string;
  } & SubjectMarkingGroupSchedulePayload,
): Promise<SubjectMarkingGroupRow> {
  return apiJson<SubjectMarkingGroupRow>(
    `/examinations/${examinationId}/subject-officer/marking-groups/${groupId}?subject_id=${subjectId}`,
    {
      method: "PATCH",
      body: JSON.stringify(payload),
    },
  );
}

export async function deleteSubjectMarkingGroup(
  examinationId: number,
  subjectId: number,
  groupId: string,
): Promise<void> {
  await apiJson<void>(
    `/examinations/${examinationId}/subject-officer/marking-groups/${groupId}?subject_id=${subjectId}`,
    { method: "DELETE" },
  );
}

export async function replaceSubjectMarkingGroupMembers(
  examinationId: number,
  subjectId: number,
  groupId: string,
  payload: { source_regions: string[]; source_roles: string[]; examiner_ids: string[] },
): Promise<SubjectMarkingGroupRow> {
  return apiJson<SubjectMarkingGroupRow>(
    `/examinations/${examinationId}/subject-officer/marking-groups/${groupId}/members?subject_id=${subjectId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function adminListSubjectOfficers(
  skip = 0,
  limit = 20,
): Promise<AdminSubjectOfficerListResponse> {
  return apiJson<AdminSubjectOfficerListResponse>(`/subject-officers?skip=${skip}&limit=${limit}`);
}

/** Fetches every subject officer page until the list is exhausted. Page size must not exceed the API max (100). */
export async function listAllSubjectOfficers(pageSize = 100): Promise<AdminSubjectOfficerRow[]> {
  const all: AdminSubjectOfficerRow[] = [];
  let skip = 0;
  while (skip <= 100_000) {
    const res = await adminListSubjectOfficers(skip, pageSize);
    all.push(...res.items);
    if (all.length >= res.total || res.items.length < pageSize) break;
    skip += pageSize;
  }
  return all;
}

export async function adminCreateSubjectOfficer(
  payload: AdminSubjectOfficerCreatePayload,
): Promise<AdminSubjectOfficerCreatedResponse> {
  return apiJson<AdminSubjectOfficerCreatedResponse>("/subject-officers", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminResetSubjectOfficerPassword(
  userId: string,
  payload: AdminPasswordResetPayload,
): Promise<AdminPasswordResetResponse> {
  return apiJson<AdminPasswordResetResponse>(`/subject-officers/${userId}/reset-password`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function adminListSubjectOfficerAssignments(
  examinationId: number,
): Promise<SubjectOfficerAssignmentListResponse> {
  return apiJson<SubjectOfficerAssignmentListResponse>(
    `/subject-officers/examinations/${examinationId}/assignments`,
  );
}

export async function adminUpsertSubjectOfficerAssignments(
  examinationId: number,
  payload: { user_id: string; subject_ids: number[] },
): Promise<SubjectOfficerAssignmentRow> {
  return apiJson<SubjectOfficerAssignmentRow>(
    `/subject-officers/examinations/${examinationId}/assignments`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function adminDeleteSubjectOfficerAssignments(
  examinationId: number,
  userId: string,
): Promise<void> {
  await apiJson<void>(`/subject-officers/examinations/${examinationId}/assignments/${userId}`, {
    method: "DELETE",
  });
}

export async function adminGetSubjectOfficerUserAssignments(
  userId: string,
): Promise<SubjectOfficerMeAssignmentsResponse> {
  return apiJson<SubjectOfficerMeAssignmentsResponse>(`/subject-officers/${userId}/assignments`);
}

export async function getSubjectOfficerMyAssignments(): Promise<SubjectOfficerMeAssignmentsResponse> {
  return apiJson<SubjectOfficerMeAssignmentsResponse>("/subject-officer/me/assignments");
}

export async function downloadExaminerInvitationLinksExport(
  examinationId: number,
  subjectId?: number,
): Promise<void> {
  const q = subjectId != null ? `?subject_id=${subjectId}` : "";
  await downloadApiFile(
    `/examinations/${examinationId}/examiner-invitations/export.xlsx${q}`,
    "examiner_invitation_links.xlsx",
  );
}

export async function getSubjectOfficerExaminerScriptsAllocation(
  examinationId: number,
  examinerId: string,
  subjectId: number,
): Promise<ExaminerPublicScriptsAllocation> {
  return apiJson<ExaminerPublicScriptsAllocation>(
    `/examinations/${examinationId}/subject-officer/examiners/${examinerId}/scripts-allocation?subject_id=${subjectId}`,
  );
}

export async function getMarkedScriptReturnFilters(
  examinationId: number,
  subjectId: number,
  examinerId?: string,
): Promise<MarkedScriptReturnFiltersResponse> {
  const params = new URLSearchParams({ subject_id: String(subjectId) });
  if (examinerId) params.set("examiner_id", examinerId);
  return apiJson<MarkedScriptReturnFiltersResponse>(
    `/examinations/${examinationId}/marked-script-returns/filters?${params.toString()}`,
  );
}

export async function getMarkedScriptReturns(
  examinationId: number,
  params: { subjectId: number; examinerId: string; paperNumber: number },
): Promise<MarkedScriptReturnGridResponse> {
  const qs = new URLSearchParams({
    subject_id: String(params.subjectId),
    examiner_id: params.examinerId,
    paper_number: String(params.paperNumber),
  });
  return apiJson<MarkedScriptReturnGridResponse>(
    `/examinations/${examinationId}/marked-script-returns?${qs.toString()}`,
  );
}

export async function upsertMarkedScriptReturn(
  examinationId: number,
  assignmentId: string,
  subjectId: number,
  payload: { returned_booklets: number; notes?: string | null },
): Promise<unknown> {
  return apiJson(
    `/examinations/${examinationId}/marked-script-returns/assignments/${assignmentId}?subject_id=${subjectId}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
}

export async function verifyMarkedScriptReturn(
  examinationId: number,
  assignmentId: string,
  subjectId: number,
  payload: { notes?: string | null; allow_mismatch?: boolean },
): Promise<unknown> {
  return apiJson(
    `/examinations/${examinationId}/marked-script-returns/assignments/${assignmentId}/verify?subject_id=${subjectId}`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export async function unverifyMarkedScriptReturn(
  examinationId: number,
  assignmentId: string,
  subjectId: number,
): Promise<unknown> {
  return apiJson(
    `/examinations/${examinationId}/marked-script-returns/assignments/${assignmentId}/unverify?subject_id=${subjectId}`,
    {
      method: "POST",
      body: JSON.stringify({}),
    },
  );
}

export async function listVerifiedLunchCoupons(examinationId: number): Promise<LunchCouponVerifiedList> {
  return apiJson<LunchCouponVerifiedList>(
    `/examinations/${examinationId}/subject-officer/lunch-coupon/verified`,
  );
}

export async function listVerifiedLunchCouponsAll(): Promise<LunchCouponVerifiedList> {
  return apiJson<LunchCouponVerifiedList>("/subject-officer/lunch-coupon/verified");
}

export async function verifyExaminerLunchCoupon(
  examinationId: number,
  referenceCode: string,
): Promise<LunchCouponVerifyResult> {
  return apiJson<LunchCouponVerifyResult>(
    `/examinations/${examinationId}/subject-officer/lunch-coupon/verify`,
    {
      method: "POST",
      body: JSON.stringify({ reference_code: referenceCode }),
    },
  );
}

export async function verifyExaminerLunchCouponScan(
  referenceCode: string,
): Promise<LunchCouponVerifyResult> {
  return apiJson<LunchCouponVerifyResult>("/subject-officer/lunch-coupon/verify-scan", {
    method: "POST",
    body: JSON.stringify({ reference_code: referenceCode }),
  });
}

export async function listAdminVerifiedLunchCouponsAll(params?: {
  examination_id?: number | null;
  subject_id?: number | null;
}): Promise<LunchCouponVerifiedList> {
  const q = new URLSearchParams();
  if (params?.examination_id != null) q.set("examination_id", String(params.examination_id));
  if (params?.subject_id != null) q.set("subject_id", String(params.subject_id));
  const qs = q.toString();
  return apiJson<LunchCouponVerifiedList>(`/admin/lunch-coupon/verified${qs ? `?${qs}` : ""}`);
}

export async function verifyAdminExaminerLunchCoupon(
  examinationId: number,
  referenceCode: string,
): Promise<LunchCouponVerifyResult> {
  return apiJson<LunchCouponVerifyResult>(
    `/admin/examinations/${examinationId}/lunch-coupon/verify`,
    {
      method: "POST",
      body: JSON.stringify({ reference_code: referenceCode }),
    },
  );
}

export async function verifyAdminExaminerLunchCouponScan(
  referenceCode: string,
): Promise<LunchCouponVerifyResult> {
  return apiJson<LunchCouponVerifyResult>("/admin/lunch-coupon/verify-scan", {
    method: "POST",
    body: JSON.stringify({ reference_code: referenceCode }),
  });
}

export async function downloadAdminLunchCouponsPdf(params: {
  examination_id: number;
  subject_id: number;
  filename?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set("subject_id", String(params.subject_id));
  const fallback = `lunch_coupons_exam_${params.examination_id}_subject_${params.subject_id}.pdf`;
  await downloadApiFile(
    `/admin/examinations/${params.examination_id}/lunch-coupons/print.pdf?${q.toString()}`,
    params.filename ?? fallback,
  );
}

export async function downloadSubjectOfficerLunchCouponsPdf(params: {
  examination_id: number;
  subject_id: number;
  filename?: string;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set("subject_id", String(params.subject_id));
  const fallback = `lunch_coupons_exam_${params.examination_id}_subject_${params.subject_id}.pdf`;
  await downloadApiFile(
    `/examinations/${params.examination_id}/subject-officer/lunch-coupons/print.pdf?${q.toString()}`,
    params.filename ?? fallback,
  );
}

export type MarkingScriptSourceMode = "allocation" | "manual";

export type MarkingScriptSourceExaminerRow = {
  examiner_id: string;
  name: string;
  examiner_type: ExaminerTypeApi;
  phone_number: string | null;
  allocation_count: number;
  manual_count: number;
  effective_count: number;
};

export type MarkingScriptSourceResponse = {
  examination_id: number;
  subject_id: number;
  source_mode: MarkingScriptSourceMode;
  available_papers: number[];
  paper_number: number | null;
  examiners: MarkingScriptSourceExaminerRow[];
};

export async function getMarkingScriptSource(
  examinationId: number,
  subjectId: number,
  paper?: number | null,
): Promise<MarkingScriptSourceResponse> {
  const params = new URLSearchParams();
  if (paper != null && paper > 0) params.set("paper", String(Math.floor(paper)));
  const qs = params.toString();
  return apiJson<MarkingScriptSourceResponse>(
    `/admin/examinations/${examinationId}/subjects/${subjectId}/marking-script-source${qs ? `?${qs}` : ""}`,
  );
}

export async function updateMarkingScriptSource(
  examinationId: number,
  subjectId: number,
  sourceMode: MarkingScriptSourceMode,
): Promise<MarkingScriptSourceResponse> {
  return apiJson<MarkingScriptSourceResponse>(
    `/admin/examinations/${examinationId}/subjects/${subjectId}/marking-script-source`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_mode: sourceMode }),
    },
  );
}

export type ManualMarkedScriptItem = {
  examiner_id: string;
  paper_number: number;
  script_count: number;
};

export async function upsertManualMarkedScripts(
  examinationId: number,
  subjectId: number,
  paper: number,
  items: ManualMarkedScriptItem[],
): Promise<MarkingScriptSourceResponse> {
  return apiJson<MarkingScriptSourceResponse>(
    `/admin/examinations/${examinationId}/subjects/${subjectId}/manual-marked-scripts?paper=${paper}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    },
  );
}

export type ManualMarkedScriptsUploadRowError = {
  row_number: number;
  message: string;
};

export type ManualMarkedScriptsUploadResponse = {
  applied_count: number;
  skipped_count: number;
  errors: ManualMarkedScriptsUploadRowError[];
  validate_only: boolean;
};

export async function downloadManualMarkedScriptsTemplate(
  examinationId: number,
  subjectId: number,
  paper: number,
): Promise<void> {
  await downloadApiFile(
    `/admin/examinations/${examinationId}/subjects/${subjectId}/manual-marked-scripts/upload-template?paper=${paper}`,
    `manual_marked_scripts_ex${examinationId}_sub${subjectId}_p${paper}.xlsx`,
  );
}

export async function uploadManualMarkedScripts(
  examinationId: number,
  subjectId: number,
  paper: number,
  file: File,
  options?: { validateOnly?: boolean },
): Promise<ManualMarkedScriptsUploadResponse> {
  const params = new URLSearchParams({ paper: String(paper) });
  if (options?.validateOnly) params.set("validate_only", "true");
  const formData = new FormData();
  formData.append("file", file);
  return apiJson<ManualMarkedScriptsUploadResponse>(
    `/admin/examinations/${examinationId}/subjects/${subjectId}/manual-marked-scripts/upload?${params.toString()}`,
    { method: "POST", body: formData },
  );
}

// --- Script checkers & data entry clerks ---

export type WorkforceAssignmentBatchStatus = "active" | "completed" | "cancelled";

export type WorkforceAvailabilityStatus = "pending" | "confirmed" | "declined";

export type WorkforceRosterRow = {
  id: string;
  examination_id: number;
  name: string;
  phone_number: string | null;
  region: string | null;
  reference_code: string | null;
  portal_url: string;
  portal_invite_sms_sent_at: string | null;
  availability_status: WorkforceAvailabilityStatus;
  availability_responded_at: string | null;
  availability_deadline: string | null;
  has_bank_account: boolean;
  created_at: string;
  updated_at: string;
};

export type WorkforceRosterCreatePayload = {
  name: string;
  phone_number?: string | null;
  region?: string | null;
  reference_code?: string | null;
};

export type WorkforceRosterUpdatePayload = Partial<WorkforceRosterCreatePayload>;

export type WorkforceInviteSmsResult = {
  id: string;
  sent: boolean;
  error: string | null;
};

export type WorkforceBulkInviteSmsResponse = {
  results: WorkforceInviteSmsResult[];
  sent_count: number;
  failed_count: number;
};

export type WorkforceAssignmentBatchRow = {
  id: string;
  examination_id: number;
  subject_id: number;
  paper_number: number;
  script_count: number;
  status: WorkforceAssignmentBatchStatus;
  batch_sequence: number;
  assigned_at: string;
  assigned_by_user_id: string | null;
  completed_at: string | null;
  completed_by_user_id: string | null;
};

export type WorkforceAssignmentPersonRow = {
  id: string;
  name: string;
  reference_code: string | null;
  phone_number: string | null;
  availability_status: WorkforceAvailabilityStatus;
  has_bank_account: boolean;
  active_batch: WorkforceAssignmentBatchRow | null;
  assigned_total: number;
  completed_total: number;
  uncompleted_total: number;
  batches: WorkforceAssignmentBatchRow[];
};

export type WorkforceAssignmentGridResponse = {
  examination_id: number;
  subject_id: number;
  paper_number: number;
  items: WorkforceAssignmentPersonRow[];
};

export type WorkforceAssignmentRosterResponse = {
  examination_id: number;
  items: WorkforceAssignmentPersonRow[];
};

export const WORKFORCE_PAPER_OPTIONS = [1, 2] as const;

export type WorkforceRatesResponse = {
  examination_id: number;
  rate_per_script_ghs: string | null;
  commuting_allowance_ghs: string | null;
  lunch_allowance_ghs: string | null;
  withholding_tax_percent: string;
};

export type WorkforceRatesPutPayload = {
  rate_per_script_ghs: string;
  commuting_allowance_ghs: string;
  lunch_allowance_ghs: string;
  withholding_tax_percent: string;
};

export type WorkforcePayoutCompletedBatchLine = {
  subject_id: number;
  subject_code: string | null;
  subject_name: string | null;
  paper_number: number;
  script_count: number;
  batch_sequence: number;
};

export type WorkforcePayoutRow = {
  id: string;
  examination_id: number;
  examination_label: string;
  full_name: string;
  reference_code: string | null;
  phone_number: string | null;
  completed_scripts: number;
  num_days: number;
  rate_per_script_ghs: string;
  commuting_allowance_ghs: string;
  lunch_allowance_ghs: string;
  commuting_payable_ghs: string;
  lunch_payable_ghs: string;
  script_gross_ghs: string;
  withholding_tax_percent: string;
  withholding_tax_ghs: string;
  script_net_ghs: string;
  has_rate: boolean;
  payable_ghs: string;
  completed_batch_lines: WorkforcePayoutCompletedBatchLine[];
  bank_branch_id: string | null;
  bank_code: string | null;
  bank_name: string | null;
  branch_name: string | null;
  account_number: string | null;
  has_bank_account: boolean;
};

export type WorkforcePayoutListResponse = {
  items: WorkforcePayoutRow[];
  total: number;
};

export type WorkforcePublicBatchRow = {
  id: string;
  subject_id: number;
  subject_code: string | null;
  subject_name: string | null;
  paper_number: number;
  script_count: number;
  status: WorkforceAssignmentBatchStatus;
  batch_sequence: number;
  assigned_at: string;
  completed_at: string | null;
};

export type WorkforcePublicPortal = {
  id: string;
  name: string;
  examination_id: number;
  examination_label: string;
  reference_code: string | null;
  region: string | null;
  role_label: string;
  availability_status: WorkforceAvailabilityStatus;
  availability_responded_at: string | null;
  availability_deadline: string | null;
  can_respond: boolean;
  active_batches: WorkforcePublicBatchRow[];
  completed_batches: WorkforcePublicBatchRow[];
  has_bank_account: boolean;
};

export type WorkforceAvailabilityActionResponse = {
  status: WorkforceAvailabilityStatus;
  message: string;
};

export type WorkforceBankAccountPublic = {
  id: string;
  person_id: string;
  bank_branch_id: string;
  bank_code: string;
  bank_name: string;
  branch_name: string;
  account_number: string;
  created_at: string;
  updated_at: string;
};

export type WorkforceBankAccountUpsertPayload = {
  bank_branch_id: string;
  account_number: string;
};

function workforcePublicPrefix(kind: "script-checker" | "data-entry-clerk"): string {
  return kind === "script-checker" ? "/public/script-checkers" : "/public/data-entry-clerks";
}

function workforceRosterSegment(kind: "script-checker" | "data-entry-clerk"): string {
  return kind === "script-checker" ? "script-checkers" : "data-entry-clerks";
}

function workforceAssignmentSegment(kind: "script-checker" | "data-entry-clerk"): string {
  return kind === "script-checker" ? "script-checker-assignments" : "data-entry-clerk-assignments";
}

function workforceRatesSegment(kind: "script-checker" | "data-entry-clerk"): string {
  return kind === "script-checker" ? "script-checker-rates" : "data-entry-clerk-rates";
}

function workforcePayoutsSegment(kind: "script-checker" | "data-entry-clerk"): string {
  return kind === "script-checker" ? "script-checker-payouts" : "data-entry-clerk-payouts";
}

export async function getPublicWorkforcePortal(
  kind: "script-checker" | "data-entry-clerk",
  token: string,
): Promise<WorkforcePublicPortal> {
  return publicApiJson<WorkforcePublicPortal>(
    `${workforcePublicPrefix(kind)}/${encodeURIComponent(token)}`,
  );
}

export async function acceptPublicWorkforceAvailability(
  kind: "script-checker" | "data-entry-clerk",
  token: string,
): Promise<WorkforceAvailabilityActionResponse> {
  return publicApiJson<WorkforceAvailabilityActionResponse>(
    `${workforcePublicPrefix(kind)}/${encodeURIComponent(token)}/accept`,
    { method: "POST" },
  );
}

export async function declinePublicWorkforceAvailability(
  kind: "script-checker" | "data-entry-clerk",
  token: string,
): Promise<WorkforceAvailabilityActionResponse> {
  return publicApiJson<WorkforceAvailabilityActionResponse>(
    `${workforcePublicPrefix(kind)}/${encodeURIComponent(token)}/decline`,
    { method: "POST" },
  );
}

export async function getPublicWorkforceBankAccount(
  kind: "script-checker" | "data-entry-clerk",
  token: string,
): Promise<WorkforceBankAccountPublic | null> {
  const url = `${getApiBaseUrl()}${workforcePublicPrefix(kind)}/${encodeURIComponent(token)}/bank-account`;
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    if (e instanceof TypeError) throw new Error(apiNetworkErrorMessage());
    throw e;
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  return (await res.json()) as WorkforceBankAccountPublic;
}

export async function upsertPublicWorkforceBankAccount(
  kind: "script-checker" | "data-entry-clerk",
  token: string,
  payload: WorkforceBankAccountUpsertPayload,
): Promise<WorkforceBankAccountPublic> {
  return publicApiJson<WorkforceBankAccountPublic>(
    `${workforcePublicPrefix(kind)}/${encodeURIComponent(token)}/bank-account`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export async function listPublicWorkforceBankBranches(
  kind: "script-checker" | "data-entry-clerk",
  token: string,
  params?: {
    bank_name?: string | null;
    bank_name_exact?: string | null;
    branch_name?: string | null;
    skip?: number;
    limit?: number;
  },
): Promise<BankBranchListResponse> {
  const q = new URLSearchParams();
  if (params?.bank_name_exact?.trim()) q.set("bank_name_exact", params.bank_name_exact.trim());
  else if (params?.bank_name?.trim()) q.set("bank_name", params.bank_name.trim());
  if (params?.branch_name?.trim()) q.set("branch_name", params.branch_name.trim());
  if (params?.skip != null) q.set("skip", String(params.skip));
  if (params?.limit != null) q.set("limit", String(params.limit));
  const s = q.toString();
  return publicApiJson<BankBranchListResponse>(
    `${workforcePublicPrefix(kind)}/${encodeURIComponent(token)}/bank-branches${s ? `?${s}` : ""}`,
  );
}

export async function getPublicWorkforceDistinctBankNames(
  kind: "script-checker" | "data-entry-clerk",
  token: string,
  q?: string,
): Promise<string[]> {
  const params = new URLSearchParams();
  if (q?.trim()) params.set("q", q.trim());
  const s = params.toString();
  return publicApiJson<string[]>(
    `${workforcePublicPrefix(kind)}/${encodeURIComponent(token)}/bank-names${s ? `?${s}` : ""}`,
  );
}

export async function listAdminWorkforceRoster(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
): Promise<WorkforceRosterRow[]> {
  return apiJson<WorkforceRosterRow[]>(
    `/admin/examinations/${examinationId}/${workforceRosterSegment(kind)}`,
  );
}

export async function createAdminWorkforceRosterMember(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  payload: WorkforceRosterCreatePayload,
  options?: { sendSms?: boolean },
): Promise<WorkforceRosterRow> {
  const q = options?.sendSms ? "?send_sms=true" : "";
  return apiJson<WorkforceRosterRow>(
    `/admin/examinations/${examinationId}/${workforceRosterSegment(kind)}${q}`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export async function updateAdminWorkforceRosterMember(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  personId: string,
  payload: WorkforceRosterUpdatePayload,
): Promise<WorkforceRosterRow> {
  return apiJson<WorkforceRosterRow>(
    `/admin/examinations/${examinationId}/${workforceRosterSegment(kind)}/${personId}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export async function deleteAdminWorkforceRosterMember(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  personId: string,
): Promise<void> {
  await apiJson<void>(
    `/admin/examinations/${examinationId}/${workforceRosterSegment(kind)}/${personId}`,
    { method: "DELETE" },
  );
}

export async function sendAdminWorkforceInviteSms(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  personId: string,
): Promise<WorkforceInviteSmsResult> {
  return apiJson<WorkforceInviteSmsResult>(
    `/admin/examinations/${examinationId}/${workforceRosterSegment(kind)}/${personId}/send-invite-sms`,
    { method: "POST" },
  );
}

export async function bulkSendAdminWorkforceInviteSms(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  ids: string[],
): Promise<WorkforceBulkInviteSmsResponse> {
  return apiJson<WorkforceBulkInviteSmsResponse>(
    `/admin/examinations/${examinationId}/${workforceRosterSegment(kind)}/bulk-invite-sms`,
    { method: "POST", body: JSON.stringify({ ids }) },
  );
}

export async function getWorkforceAssignmentGrid(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  subjectId: number,
  paperNumber: number,
): Promise<WorkforceAssignmentGridResponse> {
  return apiJson<WorkforceAssignmentGridResponse>(
    `/examinations/${examinationId}/subjects/${subjectId}/${workforceAssignmentSegment(kind)}?paper_number=${paperNumber}`,
  );
}

export async function getWorkforceAssignmentRoster(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
): Promise<WorkforceAssignmentRosterResponse> {
  return apiJson<WorkforceAssignmentRosterResponse>(
    `/examinations/${examinationId}/${workforceAssignmentSegment(kind)}/roster`,
  );
}

export async function createWorkforceAssignmentBatch(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  subjectId: number,
  paperNumber: number,
  personId: string,
  scriptCount: number,
): Promise<WorkforceAssignmentBatchRow> {
  return apiJson<WorkforceAssignmentBatchRow>(
    `/examinations/${examinationId}/subjects/${subjectId}/${workforceAssignmentSegment(kind)}?paper_number=${paperNumber}`,
    { method: "POST", body: JSON.stringify({ person_id: personId, script_count: scriptCount }) },
  );
}

export async function completeWorkforceAssignmentBatch(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  subjectId: number,
  batchId: string,
): Promise<WorkforceAssignmentBatchRow> {
  return apiJson<WorkforceAssignmentBatchRow>(
    `/examinations/${examinationId}/subjects/${subjectId}/${workforceAssignmentSegment(kind)}/${batchId}/complete`,
    { method: "POST" },
  );
}

export async function cancelWorkforceAssignmentBatch(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  subjectId: number,
  batchId: string,
): Promise<WorkforceAssignmentBatchRow> {
  return apiJson<WorkforceAssignmentBatchRow>(
    `/examinations/${examinationId}/subjects/${subjectId}/${workforceAssignmentSegment(kind)}/${batchId}/cancel`,
    { method: "POST" },
  );
}

export async function getAdminWorkforceRates(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
): Promise<WorkforceRatesResponse> {
  return apiJson<WorkforceRatesResponse>(
    `/admin/examinations/${examinationId}/${workforceRatesSegment(kind)}`,
  );
}

export async function putAdminWorkforceRates(
  kind: "script-checker" | "data-entry-clerk",
  examinationId: number,
  payload: WorkforceRatesPutPayload,
): Promise<WorkforceRatesResponse> {
  return apiJson<WorkforceRatesResponse>(
    `/admin/examinations/${examinationId}/${workforceRatesSegment(kind)}`,
    { method: "PUT", body: JSON.stringify(payload) },
  );
}

export async function listAdminWorkforcePayouts(params: {
  kind: "script-checker" | "data-entry-clerk";
  examination_id: number;
}): Promise<WorkforcePayoutListResponse> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  return apiJson<WorkforcePayoutListResponse>(
    `/admin/${workforcePayoutsSegment(params.kind)}?${q.toString()}`,
  );
}

export async function downloadAdminWorkforcePayoutsBogExport(params: {
  kind: "script-checker" | "data-entry-clerk";
  examination_id: number;
  filename: string;
}): Promise<void> {
  const q = new URLSearchParams();
  q.set("examination_id", String(params.examination_id));
  await downloadApiFile(
    `/admin/${workforcePayoutsSegment(params.kind)}/bog-export.xlsx?${q.toString()}`,
    params.filename,
  );
}
