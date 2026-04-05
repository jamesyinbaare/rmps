"use client";

import { useCallback, useEffect, useState } from "react";

import {
  deleteExamDocument,
  downloadExamDocument,
  listExamDocuments,
  uploadExamDocument,
  type ExamDocument,
} from "@/lib/api";
import { ExamDocumentCard } from "@/components/exam-document-card";
import { formInputClass, formLabelClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

function UploadModal({
  titleId,
  title,
  description,
  uploadError,
  uploadBusy,
  onTitleChange,
  onDescriptionChange,
  onFileChange,
  onSubmit,
  onClose,
}: {
  titleId: string;
  title: string;
  description: string;
  uploadError: string | null;
  uploadBusy: boolean;
  onTitleChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onFileChange: (f: File | null) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40"
        onClick={() => !uploadBusy && onClose()}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            Upload document
          </h2>
          <button
            type="button"
            onClick={() => !uploadBusy && onClose()}
            disabled={uploadBusy}
            className={`rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted ${inputFocusRing} disabled:opacity-50`}
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Supervisors and inspectors can download published files from their Documents page.
        </p>
        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-4">
          <div>
            <label htmlFor="modal-doc-title" className={formLabelClass}>
              Title
            </label>
            <input
              id="modal-doc-title"
              type="text"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              className={formInputClass}
              maxLength={255}
              autoComplete="off"
            />
          </div>
          <div>
            <label htmlFor="modal-doc-desc" className={formLabelClass}>
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              id="modal-doc-desc"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              rows={3}
              className={formInputClass}
            />
          </div>
          <div>
            <label htmlFor="modal-doc-file" className={formLabelClass}>
              File
            </label>
            <input
              id="modal-doc-file"
              type="file"
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              className={`mt-1.5 block w-full text-sm text-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground ${inputFocusRing}`}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Allowed types include PDF, Word, Excel, CSV, text, PowerPoint, and common images.
            </p>
          </div>
          {uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => !uploadBusy && onClose()}
              disabled={uploadBusy}
              className={`inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium ${inputFocusRing} disabled:opacity-50`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploadBusy}
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {uploadBusy ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteModal({
  doc,
  onClose,
  onConfirm,
  busy,
}: {
  doc: ExamDocument;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-foreground/40"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-card-foreground">Delete document</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Remove <strong className="text-card-foreground">{doc.title}</strong> and its file? Supervisors
          and inspectors will no longer see it.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className={`inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium ${inputFocusRing} disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-destructive px-4 text-sm font-medium text-destructive-foreground disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDocumentsPage() {
  const [items, setItems] = useState<ExamDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadModalKey, setUploadModalKey] = useState(0);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [deleteDoc, setDeleteDoc] = useState<ExamDocument | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listExamDocuments();
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load documents");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submitUpload(e: React.FormEvent) {
    e.preventDefault();
    setUploadError(null);
    if (!title.trim()) {
      setUploadError("Title is required.");
      return;
    }
    if (!file) {
      setUploadError("Choose a file.");
      return;
    }
    setUploadBusy(true);
    try {
      await uploadExamDocument(title.trim(), description.trim() || null, file);
      setTitle("");
      setDescription("");
      setFile(null);
      setUploadOpen(false);
      await load();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteDoc) return;
    setDeleteBusy(true);
    try {
      await deleteExamDocument(deleteDoc.id);
      setDeleteDoc(null);
      await load();
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteBusy(false);
    }
  }

  async function onDownload(doc: ExamDocument) {
    setDownloadingId(doc.id);
    try {
      await downloadExamDocument(doc);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloadingId(null);
    }
  }

  function openUploadModal() {
    setUploadModalKey((k) => k + 1);
    setUploadError(null);
    setTitle("");
    setDescription("");
    setFile(null);
    setUploadOpen(true);
  }

  function closeUploadModal() {
    setUploadOpen(false);
    setUploadError(null);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Files for supervisors and inspectors to download ({total}{" "}
            {total === 1 ? "file" : "files"}).
          </p>
        </div>
        <button
          type="button"
          onClick={openUploadModal}
          className={`inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover ${inputFocusRing}`}
        >
          Upload document
        </button>
      </div>

      {loadError ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </p>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-card-foreground">Published files</h2>
        {loading ? (
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="mt-4 text-sm text-muted-foreground">
            No documents yet. Use <strong className="font-medium text-card-foreground">Upload document</strong>{" "}
            to add one.
          </p>
        ) : (
          <ul className="mt-4 grid list-none grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((doc) => (
              <li key={doc.id} className="min-w-0">
                <ExamDocumentCard
                  doc={doc}
                  variant="admin"
                  downloading={downloadingId === doc.id}
                  onDownload={() => void onDownload(doc)}
                  onDelete={() => setDeleteDoc(doc)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {uploadOpen ? (
        <UploadModal
          key={uploadModalKey}
          titleId="upload-document-dialog-title"
          title={title}
          description={description}
          uploadError={uploadError}
          uploadBusy={uploadBusy}
          onTitleChange={setTitle}
          onDescriptionChange={setDescription}
          onFileChange={setFile}
          onSubmit={submitUpload}
          onClose={closeUploadModal}
        />
      ) : null}

      {deleteDoc ? (
        <DeleteModal
          doc={deleteDoc}
          onClose={() => !deleteBusy && setDeleteDoc(null)}
          onConfirm={() => void confirmDelete()}
          busy={deleteBusy}
        />
      ) : null}
    </div>
  );
}
