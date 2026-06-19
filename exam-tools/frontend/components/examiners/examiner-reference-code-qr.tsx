"use client";

import { QRCodeSVG } from "qrcode.react";

import { buildExaminerQrPayload } from "@/lib/examiner-qr-payload";
import { cn } from "@/lib/utils";

type Props = {
  examinationId: number;
  referenceCode: string;
  size?: number;
  className?: string;
  showLabel?: boolean;
};

export function ExaminerReferenceCodeQr({
  examinationId,
  referenceCode,
  size = 96,
  className,
  showLabel = true,
}: Props) {
  if (!referenceCode) {
    return null;
  }

  const qrValue = buildExaminerQrPayload(examinationId, referenceCode);

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <QRCodeSVG value={qrValue} size={size} level="L" includeMargin />
      {showLabel ? (
        <span className="font-mono text-xs font-medium tracking-wide text-foreground">{referenceCode}</span>
      ) : null}
    </div>
  );
}
