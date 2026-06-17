"use client";

import {
  OfficialAccountsExportMenu,
  type ExportMenuOption,
} from "@/components/official-accounts-export-menu";

const EXPORT_OPTIONS: ExportMenuOption[] = [
  {
    key: "standard",
    label: "Export Excel",
    description: "Compact table with variance highlighting.",
    primary: true,
  },
  {
    key: "rich",
    label: "Rich formatted Excel",
    description: "KPI summary, column groups, colour-coded variances, legend sheet, print-ready layout.",
  },
];

type Props = {
  centreCount: number;
  disabled: boolean;
  disabledReason?: string;
  exportBusy: string | null;
  onExport: (key: string) => void;
};

export function InspectorAnalysisExportMenu({
  centreCount,
  disabled,
  disabledReason,
  exportBusy,
  onExport,
}: Props) {
  return (
    <OfficialAccountsExportMenu
      sectionId="inspector-analysis"
      options={EXPORT_OPTIONS}
      recordCount={0}
      centreCount={centreCount}
      disabled={disabled}
      disabledReason={disabledReason}
      exportBusy={exportBusy}
      onExport={onExport}
      hideSummary={centreCount === 0}
      footnote="Rich export includes a legend sheet and signed variance formats."
    />
  );
}
