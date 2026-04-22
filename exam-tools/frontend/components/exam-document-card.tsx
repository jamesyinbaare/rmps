"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { fetchExamDocumentBlob, type ExamDocument } from "@/lib/api";
import {
  examDocumentPlaceholderKind,
  examDocumentThumbnailGradient,
  examDocumentThumbContentKind,
  fileExtensionDisplay,
  placeholderLabel,
} from "@/lib/exam-document-file-kind";

import { ExamDocumentPdfThumbnail } from "@/components/exam-document-pdf-thumbnail";

const inputFocusRing =
  "focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30";

export function formatExamDocumentBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function StaticTypeThumb({ filename }: { filename: string }) {
  const kind = examDocumentPlaceholderKind(filename);
  const gradient = examDocumentThumbnailGradient(kind);
  const ext = fileExtensionDisplay(filename);
  const typeLabel = placeholderLabel(kind);

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-1 px-3 py-4 text-center">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} aria-hidden />
      <div className="relative">
        <span className="font-mono text-2xl font-bold uppercase tracking-tight text-card-foreground sm:text-3xl">
          {ext}
        </span>
        <span className="mt-1 block text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {typeLabel}
        </span>
      </div>
    </div>
  );
}

/** Scales full text to fit the thumbnail box; no scrollbars. */
function ExamDocumentTextThumbnail({ text }: { text: string }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLPreElement>(null);

  const relayout = useCallback(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;
    const cw = Math.max(0, outer.clientWidth - 8);
    const ch = Math.max(0, outer.clientHeight - 8);
    inner.style.transform = "none";
    inner.style.width = `${cw}px`;
    inner.style.maxWidth = `${cw}px`;
    const sw = inner.scrollWidth;
    const sh = inner.scrollHeight;
    if (sh < 1 || sw < 1) return;
    const s = Math.min(1, cw / sw, ch / sh) * 0.99;
    inner.style.transform = `scale(${s})`;
    inner.style.transformOrigin = "top left";
  }, []);

  useLayoutEffect(() => {
    relayout();
    const ro = new ResizeObserver(relayout);
    if (outerRef.current) ro.observe(outerRef.current);
    return () => ro.disconnect();
  }, [text, relayout]);

  return (
    <div
      ref={outerRef}
      className="absolute inset-0 flex items-start justify-center overflow-hidden bg-muted p-2"
    >
      <pre
        ref={innerRef}
        className="m-0 box-border whitespace-pre-wrap break-words font-mono text-[11px] leading-snug text-card-foreground"
      >
        {text}
      </pre>
    </div>
  );
}

type FetchedThumb =
  | { status: "loading" }
  | { status: "image"; url: string }
  | { status: "pdf"; bytes: Uint8Array }
  | { status: "text"; fullText: string }
  | { status: "fallback" };

function ContentThumbnail({
  doc,
  contentKind,
}: {
  doc: ExamDocument;
  contentKind: "image" | "pdf" | "text";
}) {
  const [thumb, setThumb] = useState<FetchedThumb>({ status: "loading" });
  const urlRef = useRef<string | null>(null);

  const onPdfRenderFailed = useCallback(() => {
    setThumb({ status: "fallback" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const blob = await fetchExamDocumentBlob(doc.id);
        if (cancelled) return;

        if (contentKind === "image") {
          const url = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(url);
            return;
          }
          urlRef.current = url;
          setThumb({ status: "image", url });
          return;
        }
        if (contentKind === "pdf") {
          const buf = await blob.arrayBuffer();
          if (cancelled) return;
          setThumb({ status: "pdf", bytes: new Uint8Array(buf) });
          return;
        }
        if (contentKind === "text") {
          const t = await blob.text();
          if (cancelled) return;
          setThumb({ status: "text", fullText: t });
          return;
        }
        setThumb({ status: "fallback" });
      } catch {
        if (!cancelled) setThumb({ status: "fallback" });
      }
    })();

    return () => {
      cancelled = true;
      if (urlRef.current) {
        URL.revokeObjectURL(urlRef.current);
        urlRef.current = null;
      }
    };
  }, [doc.id, contentKind]);

  if (thumb.status === "loading") {
    return (
      <div
        className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted to-muted-foreground/10"
        aria-busy="true"
        aria-label="Loading thumbnail"
      />
    );
  }

  if (thumb.status === "fallback") {
    return <StaticTypeThumb filename={doc.original_filename} />;
  }

  if (thumb.status === "image") {
    return (
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element -- blob URL from authenticated API */}
        <img
          src={thumb.url}
          alt=""
          className="max-h-full max-w-full object-contain object-center"
        />
      </div>
    );
  }

  if (thumb.status === "pdf") {
    return (
      <ExamDocumentPdfThumbnail data={thumb.bytes} onRenderFailed={onPdfRenderFailed} />
    );
  }

  return <ExamDocumentTextThumbnail text={thumb.fullText} />;
}

function ExamDocumentThumbnail({ doc }: { doc: ExamDocument }) {
  const contentKind = useMemo(
    () => examDocumentThumbContentKind(doc.original_filename, doc.size_bytes),
    [doc.original_filename, doc.size_bytes],
  );

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
      {contentKind === "static" ? (
        <StaticTypeThumb filename={doc.original_filename} />
      ) : (
        <ContentThumbnail
          key={`${doc.id}-${doc.original_filename}-${doc.size_bytes}`}
          doc={doc}
          contentKind={contentKind}
        />
      )}
    </div>
  );
}

type ExamDocumentCardProps = {
  doc: ExamDocument;
  variant: "admin" | "staff";
  downloading?: boolean;
  onDownload: () => void;
  onDelete?: () => void;
};

export function ExamDocumentCard({
  doc,
  variant,
  downloading = false,
  onDownload,
  onDelete,
}: ExamDocumentCardProps) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <ExamDocumentThumbnail doc={doc} />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-semibold text-card-foreground">{doc.title}</h3>
        {doc.description ? (
          <p className="line-clamp-2 text-sm text-muted-foreground">{doc.description}</p>
        ) : null}
        <div className="mt-auto space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
          <p className="truncate font-medium text-card-foreground/90" title={doc.original_filename}>
            {doc.original_filename}
          </p>
          <p>
            {formatExamDocumentBytes(doc.size_bytes)}
            {" · "}
            <time dateTime={doc.created_at}>{new Date(doc.created_at).toLocaleString()}</time>
          </p>
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={downloading}
            onClick={onDownload}
            className={`inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-input-border bg-background px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50 sm:flex-none ${inputFocusRing}`}
          >
            {downloading ? "Downloading…" : "Download"}
          </button>
          {variant === "admin" && onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className={`inline-flex min-h-10 items-center justify-center rounded-lg border border-destructive/40 bg-background px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/5 ${inputFocusRing}`}
            >
              Delete
            </button>
          ) : null}
        </div>
      </div>
    </article>
  );
}
