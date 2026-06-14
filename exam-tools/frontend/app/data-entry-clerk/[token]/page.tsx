"use client";

import { WorkforcePublicPortalPage } from "@/components/workforce/workforce-public-portal-page";
import { DATA_ENTRY_CLERK_CONFIG } from "@/lib/workforce-kind";

export default function DataEntryClerkPortalPage() {
  return <WorkforcePublicPortalPage config={DATA_ENTRY_CLERK_CONFIG} />;
}
