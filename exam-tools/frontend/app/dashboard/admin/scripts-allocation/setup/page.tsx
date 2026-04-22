"use client";

import { Suspense } from "react";

import { ScriptsAllocationView } from "../scripts-allocation-view";

export default function ScriptsAllocationSetupPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <ScriptsAllocationView initialSetupOpen useSetupPath />
    </Suspense>
  );
}
