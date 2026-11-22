import type { BulkUploadError, BulkUploadResponse } from "@/types";
import {
  bulkUploadCandidateChunk,
  parseBulkUploadCandidatesFile,
} from "@/lib/api";

export const BULK_CHUNK_SIZE = 25;
export const BULK_MAX_RETRIES = 3;

export type BulkCandidateRowPayload = Record<string, string | number | null> & {
  row_number: number;
};

export type BulkUploadProgressPhase =
  | "preparing"
  | "uploading"
  | "retrying"
  | "finishing"
  | "done"
  | "error";

export interface BulkUploadProgressState {
  phase: BulkUploadProgressPhase;
  percent: number;
  currentBatch: number;
  totalBatches: number;
  totalRows: number;
  successful: number;
  failed: number;
  remaining: number;
  message: string;
}

export type BulkUploadProgressCallback = (state: BulkUploadProgressState) => void;

export function chunkRows<T>(rows: T[], size: number = BULK_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) return true;
  const msg = error.message.toLowerCase();
  if (msg.includes("unable to connect")) return true;
  if (msg.includes("network")) return true;
  if (msg.includes("failed to fetch")) return true;
  if (msg.includes("timeout")) return true;
  if (/\b4\d\d\b/.test(msg)) return false;
  if (msg.includes("missing required")) return false;
  if (msg.includes("no rows")) return false;
  return true;
}

export interface BulkUploadWithRows {
  result: BulkUploadResponse;
  rows: BulkCandidateRowPayload[];
}

export async function uploadBulkCandidatesInChunks(options: {
  examId: number;
  file: File;
  registrationType?: string;
  dryRun?: boolean;
  onProgress?: BulkUploadProgressCallback;
}): Promise<BulkUploadWithRows> {
  const { examId, file, registrationType, dryRun = false, onProgress } =
    options;
  const actionVerb = dryRun ? "Validating" : "Uploading";

  const emit = (
    partial: Partial<BulkUploadProgressState> &
      Pick<BulkUploadProgressState, "phase" | "message">
  ) => {
    const totalRows = partial.totalRows ?? 0;
    const successful = partial.successful ?? 0;
    const failed = partial.failed ?? 0;
    const processed = successful + failed;
    onProgress?.({
      phase: partial.phase,
      percent: partial.percent ?? 0,
      currentBatch: partial.currentBatch ?? 0,
      totalBatches: partial.totalBatches ?? 0,
      totalRows,
      successful,
      failed,
      remaining: Math.max(0, totalRows - processed),
      message: partial.message,
    });
  };

  emit({ phase: "preparing", percent: 2, message: "Reading your file…" });

  const parsed = await parseBulkUploadCandidatesFile(examId, file);
  const rows = parsed.rows as BulkCandidateRowPayload[];
  if (!rows.length) {
    throw new Error("File has no data rows");
  }

  const chunks = chunkRows(rows, BULK_CHUNK_SIZE);
  const totalBatches = chunks.length;
  const totalRows = rows.length;

  emit({
    phase: "uploading",
    percent: 5,
    currentBatch: 0,
    totalBatches,
    totalRows,
    successful: 0,
    failed: 0,
    message: `Prepared ${totalRows} rows in ${totalBatches} batch${totalBatches === 1 ? "" : "es"}`,
  });

  let successful = 0;
  let failed = 0;
  const errors: BulkUploadError[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const batchNumber = i + 1;
    let attempt = 0;
    let chunkResult: BulkUploadResponse | null = null;

    while (attempt < BULK_MAX_RETRIES) {
      attempt++;
      const isRetry = attempt > 1;
      emit({
        phase: isRetry ? "retrying" : "uploading",
        percent: Math.min(
          95,
          Math.round(((i + (isRetry ? 0.3 : 0)) / totalBatches) * 100)
        ),
        currentBatch: batchNumber,
        totalBatches,
        totalRows,
        successful,
        failed,
        message: isRetry
          ? `Connection issue — retrying batch ${batchNumber} of ${totalBatches} (attempt ${attempt}/${BULK_MAX_RETRIES})…`
          : `${actionVerb} batch ${batchNumber} of ${totalBatches}…`,
      });

      try {
        chunkResult = await bulkUploadCandidateChunk(
          examId,
          chunks[i],
          registrationType,
          { dryRun }
        );
        break;
      } catch (error) {
        if (!isRetryableError(error) || attempt >= BULK_MAX_RETRIES) {
          throw error;
        }
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }

    if (!chunkResult) {
      throw new Error(`Failed to ${dryRun ? "validate" : "upload"} batch ${batchNumber}`);
    }

    successful += chunkResult.successful;
    failed += chunkResult.failed;
    errors.push(...(chunkResult.errors || []));

    emit({
      phase: "uploading",
      percent: Math.min(98, Math.round((batchNumber / totalBatches) * 100)),
      currentBatch: batchNumber,
      totalBatches,
      totalRows,
      successful,
      failed,
      message: `Finished batch ${batchNumber} of ${totalBatches}`,
    });
  }

  emit({
    phase: "finishing",
    percent: 100,
    currentBatch: totalBatches,
    totalBatches,
    totalRows,
    successful,
    failed,
    message: "Finishing up…",
  });

  const result: BulkUploadResponse = {
    total_rows: totalRows,
    successful,
    failed,
    errors,
  };

  emit({
    phase: "done",
    percent: 100,
    currentBatch: totalBatches,
    totalBatches,
    totalRows,
    successful,
    failed,
    message:
      failed === 0
        ? dryRun
          ? `Validation passed — ${successful} row${successful === 1 ? "" : "s"} would succeed`
          : `Uploaded ${successful} candidate${successful === 1 ? "" : "s"} successfully`
        : dryRun
          ? `Validation complete: ${successful} would succeed, ${failed} failed`
          : `Completed with ${successful} successful and ${failed} failed`,
  });

  return { result, rows };
}

export function validateBulkCandidatesInChunks(
  options: Omit<Parameters<typeof uploadBulkCandidatesInChunks>[0], "dryRun">
): Promise<BulkUploadWithRows> {
  return uploadBulkCandidatesInChunks({ ...options, dryRun: true });
}
