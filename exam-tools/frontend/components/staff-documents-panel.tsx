"use client";

import { useCallback, useEffect, useState } from "react";

import {
  downloadExamDocument,
  listExamDocuments,
  type ExamDocument,
} from "@/lib/api";
import { ExamDocumentCard } from "@/components/exam-document-card";

export function StaffDocumentsPanel() {
  const [items, setItems] = useState<ExamDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listExamDocuments();
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDownload(doc: ExamDocument) {
    setDownloadingId(doc.id);
    try {
      await downloadExamDocument(doc);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-card-foreground">Documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Files published by administrators ({total} {total === 1 ? "file" : "files"}).
        </p>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents available yet.</p>
      ) : (
        <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2">
          {items.map((doc) => (
            <li key={doc.id} className="min-w-0">
              <ExamDocumentCard
                doc={doc}
                variant="staff"
                downloading={downloadingId === doc.id}
                onDownload={() => void onDownload(doc)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
