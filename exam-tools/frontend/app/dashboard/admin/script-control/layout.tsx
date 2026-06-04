import { Suspense } from "react";

import { ScriptControlShell } from "@/components/script-control/script-control-shell";

export default function ScriptControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-0 min-w-0 max-w-[1600px] flex-col">
      <ScriptControlShell>{children}</ScriptControlShell>
    </div>
  );
}
