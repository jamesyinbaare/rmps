// Permission API client
import { handleResponse, fetchWithAuth } from "@/lib/api";
import type {
  Permission,
  RolePermission,
  UserPermission,
  GrantPermissionRequest,
  DenyPermissionRequest,
} from "@/types/permissions";

export async function getPermissions(): Promise<Permission[]> {
  const response = await fetchWithAuth("/api/v1/admin/permissions");
  return handleResponse<Permission[]>(response);
}

export async function getRolePermissions(roleName: string): Promise<Record<string, RolePermission>> {
  const response = await fetchWithAuth(`/api/v1/admin/permissions/roles/${roleName}`);
  return handleResponse<Record<string, RolePermission>>(response);
}

export async function grantRolePermission(
  roleName: string,
  request: GrantPermissionRequest
): Promise<RolePermission> {
  const response = await fetchWithAuth(`/api/v1/admin/permissions/roles/${roleName}/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return handleResponse<RolePermission>(response);
}

export async function denyRolePermission(
  roleName: string,
  request: DenyPermissionRequest
): Promise<RolePermission> {
  const response = await fetchWithAuth(`/api/v1/admin/permissions/roles/${roleName}/deny`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return handleResponse<RolePermission>(response);
}

export async function revokeRolePermission(roleName: string, permissionKey: string): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/permissions/roles/${roleName}/${permissionKey}`, {
    method: "DELETE",
  });
  await handleResponse<void>(response);
}

export async function getUserPermissions(
  userId: string,
  includeExpired: boolean = false
): Promise<Record<string, UserPermission>> {
  const response = await fetchWithAuth(
    `/api/v1/admin/permissions/users/${userId}?include_expired=${includeExpired}`
  );
  return handleResponse<Record<string, UserPermission>>(response);
}

export async function grantUserPermission(
  userId: string,
  request: GrantPermissionRequest
): Promise<UserPermission> {
  const response = await fetchWithAuth(`/api/v1/admin/permissions/users/${userId}/grant`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return handleResponse<UserPermission>(response);
}

export async function denyUserPermission(
  userId: string,
  request: DenyPermissionRequest
): Promise<UserPermission> {
  const response = await fetchWithAuth(`/api/v1/admin/permissions/users/${userId}/deny`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });
  return handleResponse<UserPermission>(response);
}

export async function revokeUserPermission(userId: string, permissionKey: string): Promise<void> {
  const response = await fetchWithAuth(`/api/v1/admin/permissions/users/${userId}/${permissionKey}`, {
    method: "DELETE",
  });
  await handleResponse<void>(response);
}

export async function checkPermission(permissionKey: string): Promise<{ has_permission: boolean }> {
  const response = await fetchWithAuth(`/api/v1/admin/permissions/check/${permissionKey}`);
  return handleResponse<{ has_permission: boolean }>(response);
}
