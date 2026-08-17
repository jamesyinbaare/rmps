"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarNav,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarLink,
} from "@rfdtech/components/next";
import { ProfilePopover } from "@rfdtech/components";
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
  User,
  Award,
  FileBadge,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getClerkDigitalEntrySetting, logout } from "@/lib/api";
import { normalizeRole } from "@/lib/role-utils";
import type { User as SemsUser, UserRole } from "@/types/document";
import { toast } from "sonner";

type NavLeaf = {
  title: string;
  url: string;
  icon?: LucideIcon;
};

type NavSection = {
  title: string;
  url: string;
  icon: LucideIcon;
  items: NavLeaf[];
};

const getNavMain = (
  userRole?: UserRole | number,
  clerkDigitalEntryEnabled = false
): NavSection[] => {
  const normalizedRole = normalizeRole(userRole);

  if (normalizedRole === "DATACLERK") {
    const items: NavLeaf[] = [{ title: "Batches", url: "/clerk" }];
    if (clerkDigitalEntryEnabled) {
      items.push({ title: "Digital", url: "/scores/data-entry/digital" });
    }
    return [
      {
        title: "My Work",
        url: "/clerk",
        icon: ListTodo,
        items,
      },
      {
        title: "Results",
        url: "/results",
        icon: Award,
        items: [{ title: "Browse Results", url: "/results" }],
      },
      {
        title: "Certificates",
        url: "/results/certificates",
        icon: FileBadge,
        items: [
          { title: "Manage Certificates", url: "/results/certificates" },
          { title: "Issuance Ledger", url: "/results/certificates/issuances" },
          { title: "Batches", url: "/results/batches" },
          { title: "Certificate Studio", url: "/results/certificate-studio" },
          { title: "Issue Forms", url: "/results/certificate-issue-forms" },
        ],
      },
    ];
  }

  const baseNav: NavSection[] = [
    {
      title: "ICM Studio",
      url: "/icm-studio",
      icon: Home,
      items: [
        { title: "Overview", url: "/icm-studio" },
        { title: "All files", url: "/icm-studio/documents" },
        { title: "Recent", url: "/icm-studio/documents?filter=recent" },
        { title: "Folders", url: "/icm-studio/folders" },
        { title: "Generate ICMs", url: "/icm-studio/generate-icms" },
        { title: "Track ICMS", url: "/icm-studio/track-icms" },
      ],
    },
    {
      title: "Examinations",
      url: "/examinations",
      icon: ClipboardList,
      items: [{ title: "All Examinations", url: "/examinations" }],
    },
    {
      title: "Manage",
      url: "/manage",
      icon: Settings,
      items: (() => {
        const manageItems: NavLeaf[] = [
          { title: "Schools", url: "/schools" },
          { title: "Programmes", url: "/programmes" },
          { title: "Subjects", url: "/subjects" },
        ];
        if (normalizedRole === "SUPER_ADMIN" || normalizedRole === "REGISTRAR") {
          manageItems.push({ title: "Users", url: "/users" });
        }
        return manageItems;
      })(),
    },
    {
      title: "Scores",
      url: "/scores",
      icon: ClipboardCheck,
      items: [
        { title: "Digital", url: "/scores/data-entry/digital" },
        { title: "Score Extraction", url: "/scores/data-entry/extraction" },
        { title: "Extraction Activity", url: "/scores/data-entry/activity" },
        { title: "Apply Scores", url: "/scores/data-entry/apply-scores" },
        { title: "Manual", url: "/scores/data-entry/manual" },
        { title: "Export Results", url: "/scores/export" },
        { title: "Unmatched Records", url: "/scores/unmatched-records" },
        { title: "Issues", url: "/scores/issues" },
      ],
    },
    {
      title: "Results",
      url: "/results",
      icon: Award,
      items: [{ title: "Browse Results", url: "/results" }],
    },
    {
      title: "Certificates",
      url: "/results/certificates",
      icon: FileBadge,
        items: [
          { title: "Manage Certificates", url: "/results/certificates" },
          { title: "Issuance Ledger", url: "/results/certificates/issuances" },
          { title: "Batches", url: "/results/batches" },
          { title: "Certificate Studio", url: "/results/certificate-studio" },
          { title: "Issue Forms", url: "/results/certificate-issue-forms" },
          { title: "Certificate Settings", url: "/results/certificate-settings" },
        ],
    },
  ];

  if (normalizedRole === "SUPER_ADMIN" || normalizedRole === "REGISTRAR") {
    baseNav.push({
      title: "Data Entry Management",
      url: "/clerk/manage",
      icon: Layers,
      items: [
        { title: "Overview", url: "/clerk/manage" },
        { title: "Prepare Batches", url: "/clerk/batches" },
        { title: "Assign Work", url: "/clerk/assign" },
        { title: "Manage Clerks", url: "/clerk/clerks" },
      ],
    });
  }

  baseNav.push(
    {
      title: "Activity",
      url: "/activity",
      icon: Activity,
      items: [
        { title: "Recent Activity", url: "/activity/recent" },
        { title: "History", url: "/activity/history" },
        { title: "Analytics", url: "/activity/analytics" },
      ],
    },
    {
      title: "More",
      url: "/more",
      icon: Grid3x3,
      items: [
        { title: "Photo Album", url: "/more/photo-album", icon: Images },
        { title: "Upload Candidates", url: "/more/upload-candidates" },
        { title: "Upload Programmes", url: "/more/upload-programmes" },
        { title: "Upload Subjects", url: "/more/upload-subjects" },
        { title: "Upload Schools", url: "/more/upload-schools" },
      ],
    },
  );

  return baseNav;
};

function isLinkActive(pathname: string, search: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  const [path, query] = href.split("?");
  if (pathname !== path) return false;
  if (!query) return search === "";
  const expected = new URLSearchParams(query);
  const current = new URLSearchParams(search);
  for (const [key, value] of expected.entries()) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function SemsSidebar({
  user,
  loading,
}: {
  user: SemsUser | null;
  loading: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams.toString();
  const [clerkDigitalEntryEnabled, setClerkDigitalEntryEnabled] = useState(false);

  useEffect(() => {
    if (!user || normalizeRole(user.role) !== "DATACLERK") {
      setClerkDigitalEntryEnabled(false);
      return;
    }
    let cancelled = false;
    void getClerkDigitalEntrySetting()
      .then((res) => {
        if (!cancelled) setClerkDigitalEntryEnabled(res.enabled);
      })
      .catch(() => {
        if (!cancelled) setClerkDigitalEntryEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const navItems = useMemo(
    () => getNavMain(user?.role, clerkDigitalEntryEnabled),
    [user?.role, clerkDigitalEntryEnabled]
  );

  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const section of getNavMain()) {
      initial.add(section.title);
    }
    return initial;
  });

  const toggleGroup = (label: string, expanded: boolean) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (expanded) next.add(label);
      else next.delete(label);
      return next;
    });
  };

  const handleSignOut = async () => {
    try {
      await logout();
      toast.success("Logged out successfully");
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      window.location.href = "/login";
    }
  };

  const profileUser = user
    ? {
        name: user.full_name,
        role: normalizeRole(user.role) ?? "User",
        email: user.email,
        initials: initialsFromName(user.full_name),
      }
    : undefined;

  return (
    <Sidebar variant="plain">
      <SidebarContent>
        <SidebarNav>
          {loading &&
            ["Nav A", "Nav B", "Nav C"].map((label) => (
              <SidebarGroup key={label} collapsible expanded>
                <SidebarGroupLabel>{label}</SidebarGroupLabel>
                <SidebarLink loading loadingLabel="Loading navigation">
                  Loading
                </SidebarLink>
              </SidebarGroup>
            ))}
          {!loading &&
            navItems.map((section) => {
              const Icon = section.icon;
              const leaves = section.items.length
                ? section.items
                : [{ title: section.title, url: section.url }];
              return (
                <SidebarGroup
                  key={section.title}
                  collapsible
                  expanded={expandedGroups.has(section.title)}
                  onExpandedChange={(expanded) => toggleGroup(section.title, expanded)}
                >
                  <SidebarGroupLabel>{section.title}</SidebarGroupLabel>
                  {leaves.map((leaf) => {
                    const LeafIcon = leaf.icon ?? Icon;
                    const active = isLinkActive(pathname, search, leaf.url);
                    const [leafPath, leafQuery = ""] = leaf.url.split("?");
                    const leafParams = new URLSearchParams(leafQuery);
                    const clearsDocumentsExam =
                      leafPath === "/icm-studio/documents" && !leafParams.has("exam_id");
                    return (
                      <SidebarLink
                        key={leaf.url + leaf.title}
                        to={leaf.url}
                        active={active}
                        icon={<LeafIcon size={18} strokeWidth={1.5} />}
                        onClick={(event) => {
                          if (!clearsDocumentsExam) return;
                          if (pathname !== "/icm-studio/documents") return;
                          if (!search.includes("exam_id=")) return;
                          // Same-path Link often keeps searchParams; force a bare documents URL.
                          event.preventDefault();
                          router.replace(leaf.url);
                        }}
                      >
                        {leaf.title}
                      </SidebarLink>
                    );
                  })}
                </SidebarGroup>
              );
            })}
        </SidebarNav>
      </SidebarContent>
      <SidebarFooter>
        <ProfilePopover
          loading={loading}
          user={profileUser}
          items={[
            {
              icon: <User size={20} strokeWidth={1.5} aria-hidden />,
              label: "Account",
              onClick: () => router.push("/account"),
            },
          ]}
          onSignOut={() => {
            void handleSignOut();
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

/** @deprecated Use SemsSidebar — kept for any residual imports */
export { SemsSidebar as AppSidebar };
