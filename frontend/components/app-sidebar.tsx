"use client"

import * as React from "react"
import {
  Home,
  Activity,
  Grid3x3,
  ClipboardCheck,
  Settings,
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

// Navigation menu data
const navMain = [
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
    ],
  },
  {
    title: "Manage",
    url: "/manage",
    icon: Settings,
    items: [
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
      {
        title: "Examinations",
        url: "/examinations",
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
      },
      {
        title: "Reducto Extraction",
        url: "/scores/reducto-extraction",
      },
      {
        title: "Manual Entry",
        url: "/scores/manual-entry",
      },
      {
        title: "Processed ICMs",
        url: "/scores/processed",
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
]

// User data - can be replaced with actual user data from auth context
const user = {
  name: "John Doe",
  email: "john.doe@example.com",
  avatar: "",
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <AppLogo />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
