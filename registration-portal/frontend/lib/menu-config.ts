import {
  Users,
  GraduationCap,
  Building2,
  FileText,
  BookOpen,
  Images,
  Award,
  BookMarked,
  Shield,
  Settings,
  HelpCircle,
  DollarSign,
  Key,
  Coins,
  Search,
  BarChart3,
  UserCircle,
} from "lucide-react";
import type { Role } from "@/types";
import { LucideIcon } from "lucide-react";

export interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: Role[]; // Roles that can access this menu item
  requiresCoordinator?: boolean; // Only for SchoolAdmin (coordinators)
}

// System Admin Menu Items (for SystemAdmin, Director, DeputyDirector, PrincipalManager, SeniorManager, Manager, Staff)
export const systemAdminMenuItems: MenuItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: GraduationCap,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/exams",
    label: "Exams",
    icon: GraduationCap,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/admin/certificate-requests",
    label: "Certificate Requests",
    icon: FileText,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/admin/photo-album",
    label: "Photo Album",
    icon: Images,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/admin/fees",
    label: "Fees Management",
    icon: DollarSign,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/admin/api-users",
    label: "API Users",
    icon: Users,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
];

// System Admin "More Actions" Menu Items
export const systemAdminMoreActions: MenuItem[] = [
  {
    href: "/dashboard/schools",
    label: "Schools",
    icon: Building2,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/admin/programmes",
    label: "Programmes",
    icon: BookOpen,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/admin/subjects",
    label: "Subjects",
    icon: BookMarked,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/admin/results",
    label: "Results",
    icon: Award,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/admin/results/blocks",
    label: "Result Blocks",
    icon: Shield,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/admin/settings",
    label: "Settings",
    icon: Settings,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
  {
    href: "/dashboard/help",
    label: "Help & Support",
    icon: HelpCircle,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"],
  },
];

// School User Menu Items (for SchoolAdmin and User)
export const schoolUserMenuItems: MenuItem[] = [
  {
    href: "/dashboard/my-school",
    label: "My School",
    icon: Building2,
    roles: ["SchoolAdmin", "SchoolStaff"],
  },
  {
    href: "/dashboard/my-school/register",
    label: "Registration",
    icon: FileText,
    roles: ["SchoolAdmin", "SchoolStaff"],
  },
  {
    href: "/dashboard/my-school/candidates",
    label: "Candidates",
    icon: GraduationCap,
    roles: ["SchoolAdmin", "SchoolStaff"],
  },
  {
    href: "/dashboard/my-school/photo-album",
    label: "Photo Album",
    icon: Images,
    roles: ["SchoolAdmin", "SchoolStaff"],
  },
  {
    href: "/dashboard/my-school/programmes",
    label: "Programmes",
    icon: BookOpen,
    roles: ["SchoolAdmin", "SchoolStaff"],
  },
  {
    href: "/dashboard/my-school/reports",
    label: "Reports",
    icon: BarChart3,
    roles: ["SchoolAdmin", "SchoolStaff"],
  },
  {
    href: "/dashboard/my-school/profile",
    label: "School Profile",
    icon: UserCircle,
    roles: ["SchoolAdmin", "SchoolStaff"],
  },
  {
    href: "/dashboard/my-school/users",
    label: "Users",
    icon: Users,
    roles: ["SchoolAdmin"],
    requiresCoordinator: true, // Only SchoolAdmin (coordinators) can see this
  },
];

/**
 * Get menu items for a specific role
 */
export function getMenuItemsForRole(role: Role | null | undefined): MenuItem[] {
  if (!role) return [];

  // System admin roles
  if (["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"].includes(role)) {
    return systemAdminMenuItems.filter(item => item.roles.includes(role));
  }

  // School user roles
  if (role === "SchoolAdmin" || role === "SchoolStaff") {
    return schoolUserMenuItems.filter(item => {
      // Check if role has access
      if (!item.roles.includes(role)) return false;

      // If requires coordinator, only show for SchoolAdmin
      if (item.requiresCoordinator && role !== "SchoolAdmin") return false;

      return true;
    });
  }

  // API user role
  if (role === "APIUSER") {
    return apiUserMenuItems.filter(item => item.roles.includes(role));
  }

  return [];
}

/**
 * Get "More Actions" menu items for a specific role
 */
export function getMoreActionsForRole(role: Role | null | undefined): MenuItem[] {
  if (!role) return [];

  // System admin roles
  if (["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"].includes(role)) {
    return systemAdminMoreActions.filter(item => item.roles.includes(role));
  }

  // School users don't have "More Actions" menu
  // API users don't have "More Actions" menu
  if (role === "APIUSER") {
    return [];
  }

  return [];
}

/**
 * Check if a role should show the "More Actions" menu
 */
export function shouldShowMoreActions(role: Role | null | undefined): boolean {
  if (!role) return false;

  // Only system admin roles show "More Actions"
  return ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager", "Staff"].includes(role);
}

/**
 * Check if a role should show the sidebar
 */
export function shouldShowSidebar(role: Role | null | undefined): boolean {
  if (!role) return false;

  // All roles except PublicUser show sidebar
  return role !== "PublicUser";
}
