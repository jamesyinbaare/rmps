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

type NavItem = {
  title: string
  url: string
  icon?: LucideIcon
  items?: NavItem[]
}

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: NavItem[]
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

  // Recursively check if any nested item is active
  const hasActiveChild = (item: NavItem): boolean => {
    if (isActive(item.url)) return true
    if (item.items) {
      return item.items.some((subItem) => hasActiveChild(subItem))
    }
    return false
  }

  // Determine which items should be open based on active submenu items
  const getDefaultOpen = (item: typeof items[0]) => {
    if (item.isActive) return true
    if (item.items) {
      return item.items.some((subItem) => hasActiveChild(subItem))
    }
    return false
  }

  // Render nested submenu items
  const renderSubItems = (subItems: NavItem[]) => {
    return subItems.map((subItem) => {
      const hasNestedItems = subItem.items && subItem.items.length > 0
      const subActive = isActive(subItem.url) || (hasNestedItems && hasActiveChild(subItem))

      if (!hasNestedItems) {
        // Regular sub-item without nested items
        return (
          <SidebarMenuSubItem key={subItem.title}>
            <SidebarMenuSubButton asChild isActive={subActive}>
              <Link href={subItem.url}>
                {subItem.icon && <subItem.icon className="h-4 w-4" />}
                <span>{subItem.title}</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        )
      }

      // Sub-item with nested submenu
      return (
        <Collapsible
          key={subItem.title}
          asChild
          defaultOpen={hasActiveChild(subItem)}
          className="group/nested-collapsible"
        >
          <SidebarMenuSubItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuSubButton isActive={subActive}>
                {subItem.icon && <subItem.icon className="h-4 w-4" />}
                <span>{subItem.title}</span>
                <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/nested-collapsible:rotate-90" />
              </SidebarMenuSubButton>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenuSub>
                {renderSubItems(subItem.items || [])}
              </SidebarMenuSub>
            </CollapsibleContent>
          </SidebarMenuSubItem>
        </Collapsible>
      )
    })
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Platform</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const hasSubmenu = item.items && item.items.length > 0
          const itemActive = isActive(item.url) || (hasSubmenu && item.items?.some((sub) => hasActiveChild(sub)))

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
                    {item.items && renderSubItems(item.items)}
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
