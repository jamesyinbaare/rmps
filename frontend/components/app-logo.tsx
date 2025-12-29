"use client"

import { Files } from "lucide-react"
import Link from "next/link"
import { cn } from "@/lib/utils"

export function AppLogo() {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        "group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-2"
      )}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <Files className="h-4 w-4" />
      </div>
      <div className={cn(
        "flex min-w-0 flex-1 flex-col overflow-hidden transition-all duration-200",
        "group-data-[collapsible=icon]:hidden"
      )}>
        <span className="truncate text-sm font-semibold leading-tight">ICM System</span>
        <span className="truncate text-xs text-sidebar-foreground/70 leading-tight">Document Management</span>
      </div>
    </Link>
  )
}
