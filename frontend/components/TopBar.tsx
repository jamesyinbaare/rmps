"use client";

import { useState, useEffect } from "react";
import { Settings, ChevronDown, Search, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SidebarTrigger } from "./ui/sidebar";
import { Separator } from "./ui/separator";
import { cn } from "@/lib/utils";

interface TopBarProps {
  title?: string | React.ReactNode;
  onFilterChange?: (filter: string) => void;
  activeFilter?: string;
  filters?: React.ReactNode;
  onSearch?: (query: string) => void;
  searchValue?: string;
  showSearch?: boolean;
}

export function TopBar({
  title = "All files",
  onFilterChange,
  activeFilter,
  filters,
  onSearch,
  searchValue = "",
  showSearch = true,
}: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState(searchValue);
  const hasFilters = filters || onFilterChange || activeFilter;
  const totalHeight = hasFilters ? "h-28" : "h-16";

  // Sync with external searchValue prop
  useEffect(() => {
    setSearchQuery(searchValue);
  }, [searchValue]);

  // Keyboard shortcut for search (Ctrl+K or Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    onSearch?.(value);
  };

  const handleClearSearch = () => {
    setSearchQuery("");
    onSearch?.("");
  };

  return (
    <div className={cn("flex flex-col border-b border-border bg-background shrink-0", totalHeight)}>
      {/* Top Row */}
      <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-4">
        {/* Left: Sidebar Trigger and Title */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {typeof title === "string" ? (
            <h1 className="text-lg font-semibold truncate">{title}</h1>
          ) : (
            <div className="text-lg font-semibold">{title}</div>
          )}
        </div>

        {/* Center: Search Bar */}
        {showSearch && onSearch && (
          <div className="hidden md:flex items-center flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search documents (Ctrl+K)..."
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-9 pr-9 h-9"
              />
              {searchQuery && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-1/2 transform -translate-y-1/2 h-7 w-7"
                  onClick={handleClearSearch}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Right: Settings and User Avatar */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Mobile Search Button */}
          {showSearch && onSearch && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="md:hidden"
              onClick={() => {
                // Could open a search modal on mobile
                const searchInput = document.querySelector('input[type="search"]') as HTMLInputElement;
                if (searchInput) {
                  searchInput.focus();
                }
              }}
            >
              <Search className="h-4 w-4" />
            </Button>
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
        <div className="flex h-12 shrink-0 items-center gap-2 border-t border-border px-4">
          {filters || (
            <button
              onClick={() => onFilterChange?.("recent")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                activeFilter === "recent" && "bg-accent text-accent-foreground"
              )}
            >
              Recents
            </button>
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
