import { Suspense } from "react";

import { ScriptControlShell } from "@/components/script-control/script-control-shell";

export default function ScriptControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1600px]">
      <ScriptControlShell>{children}</ScriptControlShell>
    </div>
  );
}
