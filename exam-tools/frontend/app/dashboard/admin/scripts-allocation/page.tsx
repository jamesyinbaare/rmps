"use client";

import { Suspense } from "react";

import { ScriptsAllocationView } from "./scripts-allocation-view";

export default function AdminScriptsAllocationPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <ScriptsAllocationView />
    </Suspense>
  );
}
