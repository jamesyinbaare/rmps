// Permission utility functions
import type { User } from "@/types";
import type { UserPermission } from "@/types/permissions";

/**
 * Check if a user has a specific permission based on their effective permissions.
 * Note: This is a client-side check. For accurate checks, use the API.
 */
export function hasPermission(
  user: User | null,
  permissionKey: string,
  userPermissions: Record<string, UserPermission> | null = null
): boolean {
  if (!user) return false;

  // If user permissions are provided, check them
  if (userPermissions && permissionKey in userPermissions) {
    const perm = userPermissions[permissionKey];
    // Check if expired
    if (perm.expires_at) {
      const expiresAt = new Date(perm.expires_at);
      if (expiresAt < new Date()) {
        return false; // Expired
      }
    }
    return perm.granted;
  }

  // Otherwise, we can't determine from client-side data alone
  // This would require fetching from API
  return false;
}

/**
 * Get permission category display name
 */
export function getPermissionCategoryName(category: string): string {
  const categoryNames: Record<string, string> = {
    menu_access: "Menu Access",
    route_access: "Route Access",
    action: "Action",
  };
  return categoryNames[category] || category;
}

/**
 * Check if a permission has expired
 */
export function isPermissionExpired(permission: UserPermission): boolean {
  if (!permission.expires_at) return false;
  return new Date(permission.expires_at) < new Date();
}

/**
 * Format permission key for display (e.g., "user_management.view" -> "User Management - View")
 */
export function formatPermissionKey(permissionKey: string): string {
  return permissionKey
    .split(".")
    .map((part) => part.split("_").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" "))
    .join(" - ");
}
