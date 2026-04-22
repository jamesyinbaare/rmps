"use client";

import { useEffect, useRef } from "react";
import type { PDFPageProxy, RenderTask } from "pdfjs-dist";

type Props = {
  data: Uint8Array;
  onRenderFailed: () => void;
};

function isRenderingCancelled(reason: unknown): boolean {
  return (
    typeof reason === "object" &&
    reason !== null &&
    "name" in reason &&
    (reason as { name: string }).name === "RenderingCancelledException"
  );
}

function silenceRenderPromise(task: RenderTask): void {
  void task.promise.catch((reason: unknown) => {
    if (isRenderingCancelled(reason)) return;
  });
}

/**
 * Renders PDF page 1 on canvas, scaled to fit (no browser PDF viewer / controls).
 */
export function ExamDocumentPdfThumbnail({ data, onRenderFailed }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const resizeRafRef = useRef<number>(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    let cancelled = false;
    let ro: ResizeObserver | null = null;

    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

        const pdf = await pdfjs.getDocument({ data: data.slice(0), useSystemFonts: true }).promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;
        pageRef.current = page;

        const paint = () => {
          const p = pageRef.current;
          if (!p || cancelled) return;
          const w = wrap.clientWidth;
          const h = wrap.clientHeight;
          if (w < 4 || h < 4) return;

          const prev = renderTaskRef.current;
          if (prev) {
            silenceRenderPromise(prev);
            prev.cancel();
            renderTaskRef.current = null;
          }

          const base = p.getViewport({ scale: 1 });
          const scale = Math.min(w / base.width, h / base.height) * 0.99;
          const viewport = p.getViewport({ scale });

          const ctx = canvas.getContext("2d", { alpha: false });
          if (!ctx) return;

          canvas.width = viewport.width;
          canvas.height = viewport.height;

          const task = p.render({ canvasContext: ctx, viewport });
          renderTaskRef.current = task;
          silenceRenderPromise(task);
        };

        const schedulePaint = () => {
          if (resizeRafRef.current !== 0) {
            cancelAnimationFrame(resizeRafRef.current);
          }
          resizeRafRef.current = requestAnimationFrame(() => {
            resizeRafRef.current = 0;
            paint();
          });
        };

        schedulePaint();
        ro = new ResizeObserver(() => schedulePaint());
        ro.observe(wrap);
      } catch (e: unknown) {
        if (!cancelled && !isRenderingCancelled(e)) {
          onRenderFailed();
        }
      }
    })();

    return () => {
      cancelled = true;
      if (resizeRafRef.current !== 0) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = 0;
      }
      ro?.disconnect();
      const t = renderTaskRef.current;
      if (t) {
        silenceRenderPromise(t);
        t.cancel();
        renderTaskRef.current = null;
      }
      pageRef.current = null;
    };
  }, [data, onRenderFailed]);

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-muted"
    >
      <canvas ref={canvasRef} className="max-h-full max-w-full" aria-hidden />
    </div>
  );
}
