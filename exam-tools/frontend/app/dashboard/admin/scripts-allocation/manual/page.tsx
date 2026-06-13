"use client";

import { Suspense } from "react";

import { ManualAllocationView } from "@/components/scripts-allocation/manual-allocation-view";

export default function ManualScriptsAllocationPage() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-muted-foreground">Loading…</p>}>
      <ManualAllocationView />
    </Suspense>
  );
}
