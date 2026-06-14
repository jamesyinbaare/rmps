"use client";

import { WorkforcePublicPortalPage } from "@/components/workforce/workforce-public-portal-page";
import { SCRIPT_CHECKER_CONFIG } from "@/lib/workforce-kind";

export default function ScriptCheckerPortalPage() {
  return <WorkforcePublicPortalPage config={SCRIPT_CHECKER_CONFIG} />;
}
