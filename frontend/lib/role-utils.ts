import type { UserRole } from "@/types/document";

/**
 * Role hierarchy values (lower = higher privilege)
 */
const ROLE_VALUES: Record<UserRole, number> = {
  SUPER_ADMIN: 0,
  REGISTRAR: 10,
  OFFICER: 15,
  DATACLERK: 30,
};

const ALL_ROLES: UserRole[] = ["SUPER_ADMIN", "REGISTRAR", "OFFICER", "DATACLERK"];

/**
 * Normalize role to handle both number and string formats.
 * Converts number role values to their string names.
 *
 * @param role - Role as UserRole, number, or undefined
 * @returns Normalized UserRole string or undefined
 */
export function normalizeRole(role: UserRole | number | undefined): UserRole | undefined {
  if (role === undefined) return undefined;
  if (typeof role === "string") return role as UserRole;
  if (typeof role === "number") {
    // Convert number to role name
    const roleMap: Record<number, UserRole> = {
      0: "SUPER_ADMIN",
      10: "REGISTRAR",
      15: "OFFICER",
      30: "DATACLERK",
    };
    return roleMap[role];
  }
  return undefined;
}

/**
 * Get available roles that a user can see/assign based on their current role.
 * Users can only see/assign roles with equal or lower privilege (higher role values).
 *
 * @param currentUserRole - The current user's role
 * @returns Array of roles the user can see/assign
 */
export function getAvailableRoles(currentUserRole?: UserRole): UserRole[] {
  if (!currentUserRole) {
    // If no role provided, return all roles (shouldn't happen in practice)
    return ALL_ROLES;
  }

  const currentRoleValue = ROLE_VALUES[currentUserRole];

  // Return roles where role value >= current role value
  // (higher role values = lower privileges, so users can see/assign lower privilege roles)
  return ALL_ROLES.filter((role) => ROLE_VALUES[role] >= currentRoleValue);
}

/**
 * Check if a role has higher privilege than another role.
 * Lower role values = higher privileges.
 *
 * @param role1 - First role to compare
 * @param role2 - Second role to compare
 * @returns True if role1 has higher privilege than role2
 */
export function hasHigherPrivilege(role1: UserRole, role2: UserRole): boolean {
  return ROLE_VALUES[role1] < ROLE_VALUES[role2];
}

/**
 * Check if a role has equal or lower privilege than another role.
 *
 * @param role1 - First role to compare
 * @param role2 - Second role to compare
 * @returns True if role1 has equal or lower privilege than role2
 */
export function hasEqualOrLowerPrivilege(role1: UserRole, role2: UserRole): boolean {
  return ROLE_VALUES[role1] >= ROLE_VALUES[role2];
}
