"use client";

import { useState, useEffect } from "react";
import { getCurrentUser } from "@/lib/api";
import { checkPermission, getUserPermissions as getUserPermissionsApi } from "@/lib/api/permissions";
import type { User } from "@/types";
import type { UserPermission } from "@/types/permissions";

export function usePermission(permissionKey: string): boolean {
  const [hasPermission, setHasPermission] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const check = async () => {
      try {
        const result = await checkPermission(permissionKey);
        setHasPermission(result.has_permission);
      } catch (error) {
        console.error(`Failed to check permission ${permissionKey}:`, error);
        setHasPermission(false);
      } finally {
        setLoading(false);
      }
    };

    check();
  }, [permissionKey]);

  return hasPermission;
}

export function useUserPermissions(userId?: string): {
  permissions: Record<string, UserPermission> | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [permissions, setPermissions] = useState<Record<string, UserPermission> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchPermissions = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const perms = await getUserPermissionsApi(userId);
      setPermissions(perms);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Failed to fetch permissions"));
      setPermissions(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPermissions();
  }, [userId]);

  return {
    permissions,
    loading,
    error,
    refetch: fetchPermissions,
  };
}

export function useCurrentUserPermissions(): {
  permissions: Record<string, UserPermission> | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
} {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch (error) {
        console.error("Failed to get current user:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUser();
  }, []);

  const userPermissions = useUserPermissions(user?.id);

  return {
    permissions: userPermissions.permissions,
    loading: loading || userPermissions.loading,
    error: userPermissions.error,
    refetch: userPermissions.refetch,
  };
}
