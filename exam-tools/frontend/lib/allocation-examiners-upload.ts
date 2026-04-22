import { apiJson } from "./api";

export type ExaminerBulkImportRowError = {
  row_number: number;
  message: string;
};

export type ExaminerBulkImportResponse = {
  created_count: number;
  errors: ExaminerBulkImportRowError[];
};

export async function bulkUploadExaminationExaminers(
  examinationId: number,
  file: File,
): Promise<ExaminerBulkImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  return apiJson<ExaminerBulkImportResponse>(`/examinations/${examinationId}/examiners/bulk-upload`, {
    method: "POST",
    body: formData,
  });
}
