"use client";

import { Phone, Users } from "lucide-react";

import { ExecutiveSectionHeading } from "@/components/executive-ui";
import { SubjectScopeBadge, SubjectScopeLegend } from "@/components/subject-scope-badge";
import type { ExecutivePostedInspectorItem } from "@/lib/api";
import { subjectScopeCardAccentClass, subjectScopeCardBorderClass } from "@/lib/subject-scope-display";
import { cn } from "@/lib/utils";

function InspectorMobileCard({ insp }: { insp: ExecutivePostedInspectorItem }) {
  return (
    <li
      className={cn(
        "overflow-hidden rounded-xl border shadow-sm",
        subjectScopeCardAccentClass(insp.subject_scope),
      )}
    >
      <div className={cn("border-l-4 px-4 py-3.5", subjectScopeCardBorderClass(insp.subject_scope))}>
        <p className="font-semibold text-foreground">{insp.inspector_full_name}</p>
        <div className="mt-2">
          <SubjectScopeBadge scope={insp.subject_scope} />
        </div>
        {insp.inspector_phone_number ? (
          <a
            href={`tel:${insp.inspector_phone_number}`}
            className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Phone className="h-4 w-4 shrink-0" aria-hidden />
            Call {insp.inspector_phone_number}
          </a>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">No phone number on file</p>
        )}
      </div>
    </li>
  );
}

type Props = {
  inspectors: ExecutivePostedInspectorItem[];
  emptyMessage?: string;
  className?: string;
  headingAs?: "h4";
};

export function PostedInspectorsList({
  inspectors,
  emptyMessage = "No inspectors posted at this centre.",
  className,
  headingAs = "h4",
}: Props) {
  return (
    <div className={className}>
      <ExecutiveSectionHeading icon={Users} accentClass="bg-primary" as={headingAs}>
        Inspectors
      </ExecutiveSectionHeading>
      {inspectors.length > 0 ? <SubjectScopeLegend className="mt-3" /> : null}
      {inspectors.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-4 text-sm text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-3 md:hidden">
            {inspectors.map((insp) => (
              <InspectorMobileCard key={insp.posting_id} insp={insp} />
            ))}
          </ul>
          <div className="mt-3 hidden overflow-hidden rounded-xl border border-primary/20 shadow-sm md:block">
            <table className="w-full min-w-[min(100%,18rem)] border-collapse text-sm">
              <thead>
                <tr className="border-b border-primary/15 bg-linear-to-r from-primary/10 via-accent/5 to-transparent text-left">
                  <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                    Name
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                    Phone
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-semibold text-card-foreground">
                    Scope
                  </th>
                </tr>
              </thead>
              <tbody>
                {inspectors.map((insp) => (
                  <tr
                    key={insp.posting_id}
                    className="border-b border-border/70 last:border-b-0 even:bg-primary/3"
                  >
                    <td className="px-3 py-2.5 align-top font-medium text-foreground">
                      {insp.inspector_full_name}
                    </td>
                    <td className="px-3 py-2.5 align-top tabular-nums text-foreground">
                      {insp.inspector_phone_number ? (
                        <a
                          href={`tel:${insp.inspector_phone_number}`}
                          className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {insp.inspector_phone_number}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <SubjectScopeBadge scope={insp.subject_scope} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
