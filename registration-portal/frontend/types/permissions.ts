// Permission types for frontend
export interface Permission {
  key: string;
  name: string;
  description: string;
  category: string;
  default_min_role: string;
}

export interface RolePermission {
  permission_key: string;
  granted: boolean;
  is_override: boolean;
}

export interface UserPermission {
  permission_key: string;
  granted: boolean;
  is_override: boolean;
  expires_at: string | null;
  created_at: string;
}

export interface GrantPermissionRequest {
  permission_key: string;
  expires_at?: string | null;
}

export interface DenyPermissionRequest {
  permission_key: string;
}
