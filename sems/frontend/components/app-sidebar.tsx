"use client"

import * as React from "react"
import { useEffect, useState, useMemo } from "react"
import {
  Home,
  Activity,
  Grid3x3,
  ClipboardCheck,
  Settings,
  ClipboardList,
  Images,
  ListTodo,
  Layers,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { AppLogo } from "@/components/app-logo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@/components/ui/sidebar"
import { getCurrentUser } from "@/lib/api"
import { normalizeRole } from "@/lib/role-utils"
import type { User, UserRole } from "@/types/document"

// Helper function to get navigation menu based on user role
const getNavMain = (userRole?: UserRole | number) => {
  const normalizedRole = normalizeRole(userRole)

  if (normalizedRole === "DATACLERK") {
    return [
      {
        title: "My Queue",
        url: "/clerk",
        icon: ListTodo,
        items: [
          {
            title: "Open Issues",
            url: "/clerk",
          },
        ],
      },
      {
        title: "Scores",
        url: "/scores",
        icon: ClipboardCheck,
        items: [
          {
            title: "Data Entry",
            url: "/scores/data-entry",
            items: [
              {
                title: "Digital",
                url: "/scores/data-entry/digital",
              },
              {
                title: "Manual",
                url: "/scores/data-entry/manual",
              },
            ],
          },
        ],
      },
    ]
  }

  const baseNav = [
    {
      title: "ICM Studio",
      url: "/icm-studio",
      icon: Home,
      items: [
        {
          title: "Overview",
          url: "/icm-studio",
        },
        {
          title: "All files",
          url: "/icm-studio/documents",
        },
        {
          title: "Recent",
          url: "/icm-studio/documents?filter=recent",
        },
        {
          title: "Folders",
          url: "/icm-studio/folders",
        },
        {
          title: "Generate ICMs",
          url: "/icm-studio/generate-icms",
        },
        {
          title: "Track ICMS",
          url: "/icm-studio/track-icms",
        },
      ],
    },
    {
      title: "Examinations",
      url: "/examinations",
      icon: ClipboardList,
      items: [
        {
          title: "All Examinations",
          url: "/examinations",
        },
      ],
    },
    {
      title: "Manage",
      url: "/manage",
      icon: Settings,
      items: (() => {
        const manageItems = [
          {
            title: "Schools",
            url: "/schools",
          },
          {
            title: "Programmes",
            url: "/programmes",
          },
          {
            title: "Subjects",
            url: "/subjects",
          },
        ]

        if (normalizedRole === "SUPER_ADMIN" || normalizedRole === "REGISTRAR") {
          manageItems.push({
            title: "Users",
            url: "/users",
          })
        }

        return manageItems
      })(),
    },
  {
    title: "Scores",
    url: "/scores",
    icon: ClipboardCheck,
    items: [
      {
        title: "Data Entry",
        url: "/scores/data-entry",
        items: [
          {
            title: "Digital",
            url: "/scores/data-entry/digital",
          },
          {
            title: "Reducto Extraction",
            url: "/scores/data-entry/reducto-extraction",
          },
          {
            title: "Manual",
            url: "/scores/data-entry/manual",
          },
        ],
      },
      {
        title: "Processed ICMs",
        url: "/scores/processed",
      },
      {
        title: "Export Results",
        url: "/scores/export",
      },
      {
        title: "Unmatched Records",
        url: "/scores/unmatched-records",
      },
      {
        title: "Issues",
        url: "/scores/issues",
      },
    ],
  },
  ]

  if (normalizedRole === "SUPER_ADMIN" || normalizedRole === "REGISTRAR") {
    baseNav.push({
      title: "Clerk Ops",
      url: "/clerk/assign",
      icon: Layers,
      items: [
        {
          title: "Assign & Quotas",
          url: "/clerk/assign",
        },
        {
          title: "Leaderboard",
          url: "/clerk/stats",
        },
      ],
    })
  }

  baseNav.push(
    {
      title: "Activity",
      url: "/activity",
      icon: Activity,
      items: [
        {
          title: "Recent Activity",
          url: "/activity/recent",
        },
        {
          title: "History",
          url: "/activity/history",
        },
        {
          title: "Analytics",
          url: "/activity/analytics",
        },
      ],
    },
    {
      title: "More",
      url: "/more",
      icon: Grid3x3,
      items: [
        {
          title: "Photo Album",
          url: "/more/photo-album",
          icon: Images,
        },
        {
          title: "Upload Candidates",
          url: "/more/upload-candidates",
        },
        {
          title: "Upload Programmes",
          url: "/more/upload-programmes",
        },
        {
          title: "Upload Subjects",
          url: "/more/upload-subjects",
        },
        {
          title: "Upload Schools",
          url: "/more/upload-schools",
        },
      ],
    },
  )

  return baseNav
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadUser = async () => {
      try {
        const currentUser = await getCurrentUser()
        setUser(currentUser)
      } catch (error) {
        console.error("Error loading user:", error)
        // User might not be authenticated, AuthGuard will handle redirect
      } finally {
        setLoading(false)
      }
    }
    loadUser()
  }, [])

  // Don't render user section if not loaded or no user
  const userData = user
    ? {
        name: user.full_name,
        email: user.email,
        avatar: "",
      }
    : null

  // Memoize navigation menu to regenerate when user role changes
  const navItems = useMemo(() => {
    return getNavMain(user?.role)
  }, [user?.role])

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <AppLogo />
      </SidebarHeader>
      <SidebarContent>
        {!loading && user && <NavMain key={`nav-${user.id}-${user.role}`} items={navItems} />}
        {loading && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            Loading menu...
          </div>
        )}
      </SidebarContent>
      <SidebarFooter>
        {!loading && userData && <NavUser user={userData} />}
        {loading && (
          <div className="px-2 py-4 text-sm text-muted-foreground text-center">
            Loading...
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
