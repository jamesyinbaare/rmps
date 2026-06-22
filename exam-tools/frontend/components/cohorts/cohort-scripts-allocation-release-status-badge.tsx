import { Badge } from "@/components/ui/badge";
import {
  scriptsAllocationReleaseStatus,
  scriptsAllocationReleaseStatusLabel,
  type ScriptsAllocationReleaseStatus,
} from "@/components/cohorts/cohort-scripts-allocation-release-utils";

type Props = {
  enabled: boolean;
  releaseAt: string | null;
};

function statusVariant(status: ScriptsAllocationReleaseStatus): "secondary" | "outline" | "default" {
  switch (status) {
    case "released":
      return "default";
    case "scheduled":
      return "outline";
    case "not_released":
      return "secondary";
  }
}

export function CohortScriptsAllocationReleaseStatusBadge({ enabled, releaseAt }: Props) {
  const status = scriptsAllocationReleaseStatus({
    scripts_allocation_release_enabled: enabled,
    scripts_allocation_release_at: releaseAt,
  });

  return (
    <Badge variant={statusVariant(status)} className="shrink-0 text-[10px] font-normal uppercase tracking-wide">
      {scriptsAllocationReleaseStatusLabel(status)}
    </Badge>
  );
}
