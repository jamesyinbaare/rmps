"use client"

import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { ChevronRight, type LucideIcon } from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const isActive = (href: string) => {
    if (href === "/") {
      return pathname === "/"
    }

    // Split href into path and query
    const [hrefPath, hrefQuery] = href.split("?")
    const currentPath = pathname || ""
    const currentQuery = searchParams?.toString() || ""

    // For URLs with query params, check both path and query match
    if (hrefQuery) {
      return currentPath === hrefPath && currentQuery === hrefQuery
    }

    // For URLs without query params, only match if:
    // 1. Path matches exactly
    // 2. There are no query params in the current URL
    // This prevents "/documents" from matching "/documents?filter=recent"
    return currentPath === hrefPath && !currentQuery
  }

  // Determine which items should be open based on active submenu items
  const getDefaultOpen = (item: typeof items[0]) => {
    if (item.isActive) return true
    if (item.items) {
      return item.items.some((subItem) => isActive(subItem.url))
    }
    return false
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const hasSubmenu = item.items && item.items.length > 0
          const itemActive = isActive(item.url) || (hasSubmenu && item.items?.some((sub) => isActive(sub.url)))

          if (!hasSubmenu) {
            // Single menu item without submenu
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton asChild tooltip={item.title} isActive={itemActive}>
                  <Link href={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }

          // Menu item with submenu
          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={getDefaultOpen(item)}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title} isActive={itemActive}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {item.items?.map((subItem) => {
                      const subActive = isActive(subItem.url)
                      return (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton asChild isActive={subActive}>
                            <Link href={subItem.url}>
                              <span>{subItem.title}</span>
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      )
                    })}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
