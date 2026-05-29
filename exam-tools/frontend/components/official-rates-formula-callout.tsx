import { Calculator } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

/** Rates-page guidance (replaces generic bank privacy notice on official-rates). */
export function OfficialRatesFormulaCallout({ className }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/70 bg-card px-3.5 py-3 text-xs leading-relaxed text-muted-foreground shadow-sm",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <Calculator className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <ul className="list-disc space-y-1 pl-4">
          <li>
            The same rates apply to everyone in a given role (for example, all invigilators).
          </li>
          <li>
            Daily pay and commuting are calculated per day worked. Airtime is paid once per official.
          </li>
          <li>
            Each person&apos;s total uses the number of days recorded at their centre, plus any commuting and airtime
            for that role.
          </li>
        </ul>
      </div>
    </div>
  );
}
