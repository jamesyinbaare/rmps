import { formatOfficialAccountsRecordLabel } from "@/lib/official-accounts-zone";
import { cn } from "@/lib/utils";

type Props = {
  title?: string;
  count: number;
  busy?: boolean;
  className?: string;
};

export function OfficialAccountsPanelHeader({ title = "Account records", count, busy, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3 sm:px-5",
        className,
      )}
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
        {formatOfficialAccountsRecordLabel(count, busy)}
      </p>
    </div>
  );
}
