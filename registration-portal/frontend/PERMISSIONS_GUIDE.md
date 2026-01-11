# Frontend Permission Management Guide

This guide explains how to manage permissions on the frontend and use permission checks in your components.

## Accessing Permission Management

### Main Permission Management Page
Navigate to: **`/dashboard/admin/permissions`**

From here you can:
- Access Role Permissions management
- Access User Permissions management (via User Management page)
- Learn about how the permission system works

### Menu Access
The "Permissions" menu item is available to users with these roles:
- SystemAdmin
- Director
- DeputyDirector
- PrincipalManager

## Managing Role Permissions

### Access
Navigate to: **`/dashboard/admin/permissions/roles`**

### Features
1. **Select a Role**: Choose a role from the dropdown to view and manage its permissions
2. **View Permissions**: See all permissions organized by category:
   - `menu_access` - Menu item visibility
   - `route_access` - API route access
   - `action` - Specific actions (buttons, forms, etc.)
3. **Permission Status Indicators**:
   - 🟢 **Granted** - Permission is active
   - 🔴 **Denied** - Permission is not granted
   - **Override** badge - Permission is explicitly overridden (not from hierarchy)
   - **Hierarchy** badge - Permission comes from role hierarchy (default)

### Actions Available

#### Grant Permission
- **When**: Role doesn't have permission but you want to grant it
- **Effect**: All users with this role will have the permission
- **Action**: Click "Grant" button → Confirm in dialog

#### Deny Permission
- **When**: Role has permission from hierarchy but you want to explicitly deny it
- **Effect**: All users with this role will lose the permission (even if hierarchy allows it)
- **Action**: Click "Deny" button → Confirm in dialog

#### Revoke Override
- **When**: Permission has an explicit override (grant/deny) and you want to revert to default
- **Effect**: Permission will revert to hierarchy-based behavior
- **Action**: Click "Revoke" button → Confirm in dialog

### Example Use Case
```
Scenario: You want all Staff members to be able to edit users (normally requires Manager role)

1. Select "Staff" role from dropdown
2. Find "user_management.edit" permission
3. Click "Grant" button
4. Confirm in dialog

Result: All Staff members now have user_management.edit permission
```

## Managing User Permissions

### Access
1. Go to **`/dashboard/admin/settings`**
2. Select the appropriate user group tab (General Public, Coordinators, or CTVET Staff)
3. Find the user you want to manage
4. Click the "..." menu on the user row
5. Select "Manage Permissions"

Or navigate directly to: **`/dashboard/admin/permissions/users/{userId}`**

### Features
1. **User Information Card**: Shows user details, role, and status
2. **Permission List**: Shows all effective permissions for the user
3. **Search**: Filter permissions by name or description
4. **Show Expired**: Toggle to see expired temporary permissions
5. **Permission Indicators**:
   - Status: Granted/Denied (with expiration status)
   - Source: User Override / Role/Hierarchy
   - Expiration Date: When temporary permission expires

### Actions Available

#### Grant Permission
- **When**: User doesn't have permission but you want to grant it
- **Effect**: Only this specific user will have the permission
- **Temporary Permissions**: Optional expiration date can be set
- **Action**: Click "Grant" → Set expiration (optional) → Confirm

#### Deny Permission
- **When**: User has permission from role but you want to explicitly deny it
- **Effect**: Only this specific user will lose the permission
- **Action**: Click "Deny" → Confirm in dialog

#### Revoke Override
- **When**: User has an explicit override and you want to revert to role/default
- **Effect**: Permission will revert to role-based or hierarchy-based behavior
- **Action**: Click "Revoke" → Confirm in dialog

### Example Use Case
```
Scenario: Grant a Staff member temporary permission to delete users until end of year

1. Navigate to Admin Settings (/dashboard/admin/settings)
2. Go to the CTVET Staff tab
3. Find the Staff member
3. Click "..." → "Manage Permissions"
4. Find "user_management.delete" permission
5. Click "Grant"
6. Set expiration date to "2024-12-31T23:59:59Z"
7. Confirm

Result: This specific Staff member can delete users until the expiration date
```

## Using Permission Checks in Components

### Hook: `usePermission`

Check if the current user has a specific permission:

```typescript
import { usePermission } from "@/lib/hooks/usePermissions";

function MyComponent() {
  const canEditUsers = usePermission("user_management.edit");
  const canDeleteUsers = usePermission("user_management.delete");

  return (
    <div>
      {canEditUsers && (
        <Button onClick={handleEdit}>Edit User</Button>
      )}
      {canDeleteUsers && (
        <Button variant="destructive" onClick={handleDelete}>
          Delete User
        </Button>
      )}
    </div>
  );
}
```

### Hook: `useUserPermissions`

Get all permissions for a specific user:

```typescript
import { useUserPermissions } from "@/lib/hooks/usePermissions";

function UserPermissionsList({ userId }: { userId: string }) {
  const { permissions, loading, error, refetch } = useUserPermissions(userId);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;
  if (!permissions) return <div>No permissions</div>;

  return (
    <div>
      {Object.entries(permissions).map(([key, perm]) => (
        <div key={key}>
          {key}: {perm.granted ? "✅" : "❌"}
          {perm.is_override && " (Override)"}
        </div>
      ))}
    </div>
  );
}
```

### Hook: `useCurrentUserPermissions`

Get all permissions for the currently logged-in user:

```typescript
import { useCurrentUserPermissions } from "@/lib/hooks/usePermissions";

function MyPermissions() {
  const { permissions, loading } = useCurrentUserPermissions();

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2>My Permissions</h2>
      {permissions && Object.entries(permissions).map(([key, perm]) => (
        <div key={key}>
          {key}: {perm.granted ? "✅" : "❌"}
        </div>
      ))}
    </div>
  );
}
```

## API Functions

All permission API functions are in `@/lib/api/permissions`:

```typescript
import {
  getPermissions,              // Get all available permissions
  getRolePermissions,          // Get permissions for a role
  grantRolePermission,         // Grant permission to role
  denyRolePermission,          // Deny permission to role
  revokeRolePermission,        // Revoke role permission override
  getUserPermissions,          // Get permissions for a user
  grantUserPermission,         // Grant permission to user
  denyUserPermission,          // Deny permission to user
  revokeUserPermission,        // Revoke user permission override
  checkPermission,             // Check current user's permission
} from "@/lib/api/permissions";
```

## Permission Resolution Order

When checking if a user has a permission, the system checks in this order:

1. **User-Level Override** (Highest Priority)
   - Explicit grant/deny for the specific user
   - Can have expiration date for temporary permissions
   - Overrides everything below

2. **Role-Level Override**
   - Explicit grant/deny for the user's role
   - Applies to all users with that role
   - Overrides hierarchy

3. **Role Hierarchy** (Default)
   - Based on role value (lower = higher privilege)
   - Automatic based on `default_min_role` in permission definition
   - Fallback if no overrides exist

### Example Resolution

```
User: John (Staff role)
Permission: user_management.edit (default_min_role: Manager)

1. Check user-level override: None
2. Check role-level override: Staff role has grant override → ✅ GRANTED
   (Even though Staff < Manager in hierarchy, the override applies)

User: Jane (Staff role, same as John)
Same permission check:
1. Check user-level override: Jane has explicit deny → ❌ DENIED
   (User override takes precedence over role override)
```

## Best Practices

1. **Use Permission Checks for UI Elements**
   - Hide/show buttons, menu items, forms based on permissions
   - Don't rely on role checks alone

2. **Backend Always Validates**
   - Frontend checks are for UX only
   - Backend always validates permissions for security

3. **Use Descriptive Permission Keys**
   - Format: `{resource}.{action}` (e.g., `user_management.edit`)
   - Makes permissions easier to understand and manage

4. **Temporary Permissions**
   - Use expiration dates for temporary access
   - Example: Granting permission for a specific project duration

5. **Audit Trail**
   - All permission changes are logged
   - Check `created_by_user_id` to see who granted permissions

## Common Permission Keys

All permissions are defined in `backend/app/core/permissions.py`. Common ones:

- `user_management.view` - View user management page
- `user_management.create` - Create new users
- `user_management.edit` - Edit existing users
- `user_management.delete` - Delete users
- `permission_management` - Manage permissions (meta-permission)
- `exam_management.*` - Exam-related permissions
- `school_management.*` - School-related permissions
- `results_management.*` - Results-related permissions
- And many more...

Check the backend permission registry for the complete list.
