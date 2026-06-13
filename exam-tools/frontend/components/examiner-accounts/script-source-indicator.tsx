import { scriptSourceLabel, type MarkingScriptSource } from "@/lib/examiner-script-source";
import { cn } from "@/lib/utils";

type Props = {
  source: MarkingScriptSource | "mixed";
  className?: string;
};

export function ScriptSourceIndicator({ source, className }: Props) {
  return (
    <span
      className={cn(
        "text-[10px] font-medium uppercase tracking-wide",
        source === "manual" && "text-amber-800 dark:text-amber-200",
        source === "allocation" && "text-muted-foreground",
        source === "mixed" && "text-muted-foreground",
        className,
      )}
    >
      {scriptSourceLabel(source)}
    </span>
  );
}
