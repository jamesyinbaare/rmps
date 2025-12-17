"use client";

import { Settings, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title?: string;
  onFilterChange?: (filter: string) => void;
  activeFilter?: string;
  filters?: React.ReactNode;
}

export function TopBar({
  title = "All files",
  onFilterChange,
  activeFilter,
  filters,
}: TopBarProps) {
  const hasFilters = filters || onFilterChange || activeFilter;
  const totalHeight = hasFilters ? "h-28" : "h-16";

  return (
    <div className={cn("flex flex-col border-b border-border bg-background shrink-0", totalHeight)}>
      {/* Top Row */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-6">
        {/* Left: Title */}
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">{title}</h1>
        </div>

        {/* Right: Settings and User Avatar */}
        <div className="flex items-center gap-2">
          {/* Settings */}
          <Button variant="ghost" size="icon-sm">
            <Settings className="h-4 w-4" />
          </Button>

          {/* User Avatar */}
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
            JY
          </div>
        </div>
      </div>

      {/* Bottom Row: Filters */}
      {hasFilters && (
        <div className="flex h-12 shrink-0 items-center gap-2 border-t border-border px-6">
          {filters || (
            <>
              <button
                onClick={() => onFilterChange?.("recent")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  activeFilter === "recent" && "bg-accent text-accent-foreground"
                )}
              >
                Recents
              </button>
              <button
                onClick={() => onFilterChange?.("starred")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  activeFilter === "starred" && "bg-accent text-accent-foreground"
                )}
              >
                Starred
              </button>
            </>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Name</span>
            <Button variant="ghost" size="icon-sm" className="h-6 w-6">
              <ChevronDown className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
