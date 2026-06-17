import { Suspense } from "react";

import { SubjectOfficerWorkspaceProvider } from "@/components/subject-officer/subject-officer-workspace-context";

export const SUBJECT_OFFICER_ZONE_ATTR = {
  "data-zone": "subject-officer",
} as const;

export default function SubjectOfficerLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div {...SUBJECT_OFFICER_ZONE_ATTR}>
      <SubjectOfficerWorkspaceProvider>
        <Suspense
          fallback={
            <div className="flex min-h-[40vh] items-center justify-center">
              <p className="text-sm text-muted-foreground">Loading…</p>
            </div>
          }
        >
          {children}
        </Suspense>
      </SubjectOfficerWorkspaceProvider>
    </div>
  );
}
