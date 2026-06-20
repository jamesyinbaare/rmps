"use client";

import { SubjectOfficerExaminerMobilePicker } from "@/components/subject-officer/subject-officer-examiner-mobile-picker";
import type { MarkedScriptReturnExaminerOption } from "@/lib/api";

type Props = {
  examiners: MarkedScriptReturnExaminerOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading?: boolean;
  disabled?: boolean;
  className?: string;
};

/** @deprecated Use SubjectOfficerExaminerMobilePicker with variant="marked-scripts" */
export function MarkedScriptExaminerMobileCombobox(props: Props) {
  return (
    <SubjectOfficerExaminerMobilePicker
      {...props}
      variant="marked-scripts"
      id="msr-examiner-mobile"
    />
  );
}
