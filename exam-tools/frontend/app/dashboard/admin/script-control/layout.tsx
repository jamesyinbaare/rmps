import { Suspense } from "react";

import { ScriptControlShell } from "@/components/script-control/script-control-shell";

export default function ScriptControlLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto min-w-0 max-w-[1600px] overflow-x-clip">
      <ScriptControlShell>{children}</ScriptControlShell>
    </div>
  );
}
