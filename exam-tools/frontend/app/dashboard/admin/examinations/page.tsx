"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { apiFetch, apiJson, type Examination } from "@/lib/api";
import { formInputClass, formLabelClass, primaryButtonClass } from "@/lib/form-classes";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

const outlineBtn =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-input-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50";

function Modal({
  title,
  titleId,
  children,
  onClose,
}: {
  title: string;
  titleId: string;
  children: React.ReactNode;
  onClose: () => void;
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
        aria-labelledby={titleId}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-semibold text-card-foreground">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-lg px-2 py-1 text-sm text-muted-foreground hover:bg-muted ${inputFocusRing}`}
          >
            Close
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

export default function AdminExaminationsPage() {
  const [items, setItems] = useState<Examination[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [examType, setExamType] = useState("");
  const [examSeries, setExamSeries] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const data = await apiJson<Examination[]>("/examinations");
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load examinations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const y = parseInt(year, 10);
      if (Number.isNaN(y)) throw new Error("Invalid year");
      await apiFetch("/examinations", {
        method: "POST",
        body: JSON.stringify({
          exam_type: examType.trim(),
          exam_series: examSeries.trim() || null,
          year: y,
          description: description.trim() || null,
        }),
      });
      setModalOpen(false);
      setExamType("");
      setExamSeries("");
      setYear(String(new Date().getFullYear()));
      setDescription("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create examination");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-card-foreground">Examinations</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Create examinations and manage per-subject schedules and timetables.
          </p>
        </div>
        <button type="button" className={outlineBtn} onClick={() => setModalOpen(true)}>
          New examination
        </button>
      </div>

      {error && !modalOpen ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No examinations yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
          {items.map((ex) => (
            <li key={ex.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-card-foreground">
                  {ex.year}
                  {ex.exam_series ? ` ${ex.exam_series}` : ""} — {ex.exam_type}
                </p>
                {ex.description ? (
                  <p className="mt-1 text-sm text-muted-foreground">{ex.description}</p>
                ) : null}
              </div>
              <Link
                href={`/dashboard/admin/examinations/${ex.id}`}
                className={`inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover ${inputFocusRing}`}
              >
                Open
              </Link>
            </li>
          ))}
        </ul>
      )}

      {modalOpen ? (
        <Modal title="New examination" titleId="exam-create-title" onClose={() => setModalOpen(false)}>
          {error ? (
            <p className="mb-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <form className="flex flex-col gap-4" onSubmit={onCreate}>
            <div>
              <label htmlFor="exam_type" className={formLabelClass}>
                Exam type
              </label>
              <input
                id="exam_type"
                required
                value={examType}
                onChange={(e) => setExamType(e.target.value)}
                className={formInputClass}
                placeholder="e.g. Certificate II"
              />
            </div>
            <div>
              <label htmlFor="exam_series" className={formLabelClass}>
                Series (optional)
              </label>
              <input
                id="exam_series"
                value={examSeries}
                onChange={(e) => setExamSeries(e.target.value)}
                className={formInputClass}
                placeholder="e.g. MAY/JUNE"
              />
            </div>
            <div>
              <label htmlFor="year" className={formLabelClass}>
                Year
              </label>
              <input
                id="year"
                type="number"
                required
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className={formInputClass}
              />
            </div>
            <div>
              <label htmlFor="desc" className={formLabelClass}>
                Description (optional)
              </label>
              <textarea
                id="desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={formInputClass}
              />
            </div>
            <button type="submit" disabled={saving} className={primaryButtonClass}>
              {saving ? "Saving…" : "Create"}
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
