"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Plus, ChevronDown, Upload, FolderPlus, Grid3x3, List, Settings } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title?: string;
  onNewClick?: () => void;
  onUploadClick?: () => void;
  onNewFolderClick?: () => void;
  viewMode?: "grid" | "list";
  onViewModeChange?: (mode: "grid" | "list") => void;
  onFilterChange?: (filter: string) => void;
  activeFilter?: string;
  filters?: React.ReactNode;
}

export function TopBar({
  title = "All files",
  onNewClick,
  onUploadClick,
  onNewFolderClick,
  viewMode = "grid",
  onViewModeChange,
  onFilterChange,
  activeFilter,
  filters,
}: TopBarProps) {
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setNewMenuOpen(false);
      }
    };

    if (newMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [newMenuOpen]);

  const handleNewClick = () => {
    setNewMenuOpen(!newMenuOpen);
  };

  const handleUpload = () => {
    setNewMenuOpen(false);
    onUploadClick?.();
  };

  const handleNewFolder = () => {
    setNewMenuOpen(false);
    onNewFolderClick?.();
  };

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

        {/* Center: Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search"
              className="w-full pl-9"
            />
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* New Button with Dropdown */}
          <div className="relative" ref={menuRef}>
            <Button
              variant="secondary"
              onClick={handleNewClick}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              New
              <ChevronDown className="h-4 w-4" />
            </Button>
            {newMenuOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-md border bg-popover shadow-md">
                <button
                  onClick={handleUpload}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <Upload className="h-4 w-4" />
                  Upload files
                </button>
                <button
                  onClick={handleNewFolder}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <FolderPlus className="h-4 w-4" />
                  New folder
                </button>
              </div>
            )}
          </div>

          {/* View Toggle */}
          {onViewModeChange && (
            <div className="flex items-center rounded-md border">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => onViewModeChange("grid")}
                className="rounded-r-none"
              >
                <Grid3x3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon-sm"
                onClick={() => onViewModeChange("list")}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          )}

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
