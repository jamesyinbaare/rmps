import { Badge } from "@/components/ui/badge";
import type { CertificateIssuance } from "@/types/document";

export type IssuanceStatus = CertificateIssuance["status"] | null | undefined;

/** Numbered stock is treated as printed — no separate mark-printed step. */
export function effectiveIssuanceStatus(
  status: IssuanceStatus,
  certificateNumber?: string | null
): IssuanceStatus {
  if (certificateNumber && status === "generated") return "printed";
  return status;
}

export function issuanceStatusLabel(status: IssuanceStatus): string {
  if (!status) return "Not issued";
  if (status === "matched_scan") return "Matched scan";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function IssuanceStatusBadge({
  status,
  certificateNumber,
}: {
  status: IssuanceStatus;
  certificateNumber?: string | null;
}) {
  const effective = effectiveIssuanceStatus(status, certificateNumber);
  const label = issuanceStatusLabel(effective);
  if (!effective) {
    return <Badge variant="outline">{label}</Badge>;
  }
  if (effective === "printed") {
    return (
      <Badge className="border-transparent bg-emerald-700 text-white hover:bg-emerald-700">
        {label}
      </Badge>
    );
  }
  if (effective === "generated") {
    return (
      <Badge className="border-transparent bg-sky-100 text-sky-900 hover:bg-sky-100">
        {label}
      </Badge>
    );
  }
  if (effective === "matched_scan") {
    return (
      <Badge className="border-transparent bg-teal-100 text-teal-900 hover:bg-teal-100">
        {label}
      </Badge>
    );
  }
  if (effective === "void") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  return <Badge variant="outline">{label}</Badge>;
}
