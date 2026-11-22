import type { PhotoBulkUploadError, PhotoBulkUploadResponse } from "@/types";
import { bulkUploadPhotos } from "@/lib/api";
import {
  BULK_MAX_RETRIES,
  chunkRows,
  isRetryableError,
  sleep,
  type BulkUploadProgressCallback,
  type BulkUploadProgressState,
} from "@/lib/bulk-upload";

export const PHOTO_BULK_CHUNK_SIZE = 5;

export async function uploadBulkPhotosInChunks(options: {
  examId: number;
  files: File[];
  onProgress?: BulkUploadProgressCallback;
}): Promise<PhotoBulkUploadResponse> {
  const { examId, files, onProgress } = options;

  let successful = 0;
  let failed = 0;
  let skipped = 0;

  const emit = (
    partial: Partial<BulkUploadProgressState> &
      Pick<BulkUploadProgressState, "phase" | "message">
  ) => {
    const totalRows = partial.totalRows ?? files.length;
    const nextSuccessful = partial.successful ?? successful;
    const nextFailed = partial.failed ?? failed;
    const processed = nextSuccessful + nextFailed + skipped;
    onProgress?.({
      phase: partial.phase,
      percent: partial.percent ?? 0,
      currentBatch: partial.currentBatch ?? 0,
      totalBatches: partial.totalBatches ?? 0,
      totalRows,
      successful: nextSuccessful,
      failed: nextFailed,
      remaining: Math.max(0, totalRows - processed),
      message: partial.message,
    });
  };

  if (!files.length) {
    throw new Error("No photo files selected");
  }

  emit({
    phase: "preparing",
    percent: 2,
    totalRows: files.length,
    message: "Preparing your photos…",
  });

  const chunks = chunkRows(files, PHOTO_BULK_CHUNK_SIZE);
  const totalBatches = chunks.length;
  const totalRows = files.length;

  emit({
    phase: "uploading",
    percent: 5,
    currentBatch: 0,
    totalBatches,
    totalRows,
    successful: 0,
    failed: 0,
    message: `Prepared ${totalRows} photo${totalRows === 1 ? "" : "s"} in ${totalBatches} batch${totalBatches === 1 ? "" : "es"}`,
  });

  const errors: PhotoBulkUploadError[] = [];

  for (let i = 0; i < chunks.length; i++) {
    const batchNumber = i + 1;
    let attempt = 0;
    let chunkResult: PhotoBulkUploadResponse | null = null;

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
          : `Uploading batch ${batchNumber} of ${totalBatches}…`,
      });

      try {
        chunkResult = await bulkUploadPhotos(examId, chunks[i]);
        break;
      } catch (error) {
        if (!isRetryableError(error) || attempt >= BULK_MAX_RETRIES) {
          throw error;
        }
        await sleep(1000 * 2 ** (attempt - 1));
      }
    }

    if (!chunkResult) {
      throw new Error(`Failed to upload batch ${batchNumber}`);
    }

    successful += chunkResult.successful;
    failed += chunkResult.failed;
    skipped += chunkResult.skipped;
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

  const result: PhotoBulkUploadResponse = {
    total: totalRows,
    successful,
    failed,
    skipped,
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
      failed === 0 && skipped === 0
        ? `Uploaded ${successful} photo${successful === 1 ? "" : "s"} successfully`
        : `Completed with ${successful} successful, ${failed} failed${
            skipped > 0 ? `, ${skipped} skipped` : ""
          }`,
  });

  return result;
}
