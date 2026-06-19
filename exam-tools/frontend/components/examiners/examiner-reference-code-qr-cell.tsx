"use client";

import { useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";

import { ExaminerReferenceCodeQr } from "@/components/examiners/examiner-reference-code-qr";
import { officialAccountsBtnSecondary } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  examinationId: number;
  referenceCode: string;
  examinerName?: string;
  previewSize?: number;
  modalSize?: number;
  className?: string;
  showCodeLabel?: boolean;
};

type QrModalProps = {
  examinationId: number;
  referenceCode: string;
  examinerName?: string;
  modalSize: number;
  titleId: string;
  subtitleId: string;
  onClose: () => void;
};

function ExaminerReferenceCodeQrModal({
  examinationId,
  referenceCode,
  examinerName,
  modalSize,
  titleId,
  subtitleId,
  onClose,
}: QrModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
        aria-describedby={examinerName ? subtitleId : undefined}
        className="relative z-10 flex w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg"
      >
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-mono text-lg font-semibold tracking-wide text-card-foreground">
              {referenceCode}
            </h2>
            {examinerName ? (
              <p id={subtitleId} className="mt-1 text-sm text-muted-foreground">
                {examinerName}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/30"
            aria-label="Close"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="flex justify-center px-4 py-8 sm:px-5 sm:py-10">
          <ExaminerReferenceCodeQr
            examinationId={examinationId}
            referenceCode={referenceCode}
            size={modalSize}
          />
        </div>
        <div className="border-t border-border px-4 py-4 sm:px-5">
          <button type="button" className={cn(officialAccountsBtnSecondary, "w-full sm:ml-auto sm:w-auto")} onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function ExaminerReferenceCodeQrCell({
  examinationId,
  referenceCode,
  examinerName,
  previewSize = 52,
  modalSize = 192,
  className,
  showCodeLabel = true,
}: Props) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const subtitleId = useId();

  return (
    <>
      <button
        type="button"
        className={cn(
          "rounded-md transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
          className,
        )}
        onClick={() => setOpen(true)}
        aria-label={`View QR code for ${referenceCode}`}
      >
        <ExaminerReferenceCodeQr
          examinationId={examinationId}
          referenceCode={referenceCode}
          size={previewSize}
          showLabel={showCodeLabel}
        />
      </button>

      {open ? (
        <ExaminerReferenceCodeQrModal
          examinationId={examinationId}
          referenceCode={referenceCode}
          examinerName={examinerName}
          modalSize={modalSize}
          titleId={titleId}
          subtitleId={subtitleId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
