const PAYLOAD_PATTERN = /^(\d+):(.+)$/;

export function buildExaminerQrPayload(examinationId: number, referenceCode: string): string {
  const code = referenceCode.trim().toUpperCase();
  if (examinationId <= 0) {
    throw new Error("Examination id must be positive.");
  }
  if (!code) {
    throw new Error("Reference code is required.");
  }
  return `${examinationId}:${code}`;
}

export function parseExaminerQrScan(raw: string): { examinationId: number | null; referenceCode: string } {
  const text = raw.trim();
  if (!text) {
    return { examinationId: null, referenceCode: "" };
  }

  const match = PAYLOAD_PATTERN.exec(text);
  if (match) {
    return {
      examinationId: Number.parseInt(match[1], 10),
      referenceCode: match[2].trim().toUpperCase(),
    };
  }

  return { examinationId: null, referenceCode: text.toUpperCase() };
}
