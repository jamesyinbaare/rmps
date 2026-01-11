# Adding New Models and Menus - Permission System Guide

This guide explains what happens and what you need to do when adding new models/resources and new menu items to the system.

## Current State

### What's Implemented
✅ **Permission Registry**: Centralized permission definitions in `backend/app/core/permissions.py`
✅ **Permission Service**: Permission resolution logic (user override → role override → hierarchy)
✅ **Permission API**: Endpoints for managing permissions
✅ **Permission Dependencies**: `PermissionChecker` for protecting routes
✅ **Frontend Permission Infrastructure**: Types, hooks, and API client ready

### What Needs Manual Updates
⚠️ **Menu Config**: Currently uses hardcoded role arrays (not permission-based yet)
⚠️ **Route Protection**: Not all routes use `PermissionChecker` yet
⚠️ **Menu Visibility**: Menu items still check roles directly, not permissions

## Process for Adding New Models/Resources

When you add a new model (e.g., `Invoice`, `Payment`, `Report`), follow these steps:

### Step 1: Add Permissions to Registry

Edit `backend/app/core/permissions.py` and add permissions for your new resource:

```python
# Example: Adding Invoice Management Permissions
PERMISSIONS: dict[str, Permission] = {
    # ... existing permissions ...

    # Invoice Management Permissions
    "invoice_management.view": Permission(
        name="invoice_management.view",
        description="View invoice management page",
        category="menu_access",
        default_min_role=Role.Manager,
    ),
    "invoice_management.create": Permission(
        name="invoice_management.create",
        description="Create new invoices",
        category="action",
        default_min_role=Role.Manager,
    ),
    "invoice_management.edit": Permission(
        name="invoice_management.edit",
        description="Edit invoices",
        category="action",
        default_min_role=Role.Manager,
    ),
    "invoice_management.delete": Permission(
        name="invoice_management.delete",
        description="Delete invoices",
        category="action",
        default_min_role=Role.Director,
    ),
    "invoice_management.approve": Permission(
        name="invoice_management.approve",
        description="Approve invoices",
        category="action",
        default_min_role=Role.SeniorManager,
    ),
}
```

**Permission Key Naming Convention:**
- Format: `{resource}_{action}`
- Examples: `user_management.view`, `invoice_management.create`, `exam_management.delete`
- Categories:
  - `menu_access`: For menu item visibility
  - `route_access`: For API route protection
  - `action`: For specific actions (buttons, forms)

### Step 2: Protect Backend Routes

Update your route endpoints to use `PermissionChecker`:

```python
# In your router file (e.g., app/routers/admin.py)
from app.dependencies.permissions import PermissionChecker
from typing import Annotated
from app.models import PortalUser

@router.get("/invoices")
async def list_invoices(
    current_user: Annotated[PortalUser, Depends(PermissionChecker("invoice_management.view"))],
    session: DBSessionDep,
):
    # Only users with "invoice_management.view" permission can access
    pass

@router.post("/invoices")
async def create_invoice(
    current_user: Annotated[PortalUser, Depends(PermissionChecker("invoice_management.create"))],
    session: DBSessionDep,
    invoice_data: InvoiceCreate,
):
    # Only users with "invoice_management.create" permission can access
    pass

@router.put("/invoices/{invoice_id}")
async def update_invoice(
    invoice_id: int,
    current_user: Annotated[PortalUser, Depends(PermissionChecker("invoice_management.edit"))],
    session: DBSessionDep,
    invoice_update: InvoiceUpdate,
):
    # Only users with "invoice_management.edit" permission can access
    pass

@router.delete("/invoices/{invoice_id}")
async def delete_invoice(
    invoice_id: int,
    current_user: Annotated[PortalUser, Depends(PermissionChecker("invoice_management.delete"))],
    session: DBSessionDep,
):
    # Only users with "invoice_management.delete" permission can access
    pass
```

### Step 3: Add Menu Item (Current Approach - Role-Based)

**Current State**: Menu config uses hardcoded roles. Add to `frontend/lib/menu-config.ts`:

```typescript
export const systemAdminMenuItems: MenuItem[] = [
  // ... existing items ...
  {
    href: "/dashboard/admin/invoices",
    label: "Invoices",
    icon: FileText,
    roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager"],
  },
];
```

### Step 4: Update Frontend Components (Recommended - Permission-Based)

For better flexibility, use permission checks in components:

```typescript
// In your page/component
import { usePermission } from "@/lib/hooks/usePermissions";

export default function InvoicesPage() {
  const canCreate = usePermission("invoice_management.create");
  const canEdit = usePermission("invoice_management.edit");
  const canDelete = usePermission("invoice_management.delete");

  return (
    <div>
      <h1>Invoices</h1>
      {canCreate && (
        <Button onClick={handleCreate}>
          Create Invoice
        </Button>
      )}
      {/* Table with edit/delete buttons based on permissions */}
    </div>
  );
}
```

### Step 5: Protect Frontend Routes (Optional)

You can add route-level protection in Next.js:

```typescript
// In app/dashboard/admin/invoices/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePermission } from "@/lib/hooks/usePermissions";

export default function InvoicesPage() {
  const router = useRouter();
  const canView = usePermission("invoice_management.view");

  useEffect(() => {
    if (!canView) {
      router.push("/dashboard/unauthorized");
    }
  }, [canView, router]);

  if (!canView) {
    return <div>Access Denied</div>;
  }

  // ... rest of component
}
```

## Process for Adding New Menu Items

### Current Approach (Role-Based)

1. **Add Menu Item to Config**: Edit `frontend/lib/menu-config.ts`

```typescript
export const systemAdminMenuItems: MenuItem[] = [
  // ... existing items ...
  {
    href: "/dashboard/admin/new-feature",
    label: "New Feature",
    icon: YourIcon,
    roles: ["SystemAdmin", "Director", "Manager"], // Hardcoded roles
  },
];
```

2. **Menu Items Auto-Filter**: The `getMenuItemsForRole()` function automatically filters menu items based on the user's role.

### Recommended Approach (Permission-Based) - Future Enhancement

**Migrating to Permission-Based Menus**: Update `MenuItem` interface and filtering logic:

```typescript
// Update MenuItem interface (future)
export interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredPermission?: string; // Permission key instead of roles
  roles?: Role[]; // Fallback for backward compatibility
}

// Update filtering logic (future)
export function getMenuItemsForRole(
  role: Role | null | undefined,
  userPermissions?: Record<string, UserPermission>
): MenuItem[] {
  if (!role) return [];

  return systemAdminMenuItems.filter(item => {
    // Check permission first if available
    if (item.requiredPermission && userPermissions) {
      const perm = userPermissions[item.requiredPermission];
      if (perm) {
        return perm.granted;
      }
    }
    // Fallback to role check
    if (item.roles) {
      return item.roles.includes(role);
    }
    return false;
  });
}
```

**For Now**: Continue using role-based menu config, but add permission checks to individual page components.

## Complete Example: Adding "Reports" Feature

### 1. Add Permissions to Registry

```python
# backend/app/core/permissions.py
"report_management.view": Permission(
    name="report_management.view",
    description="View reports page",
    category="menu_access",
    default_min_role=Role.Manager,
),
"report_management.generate": Permission(
    name="report_management.generate",
    description="Generate reports",
    category="action",
    default_min_role=Role.Manager,
),
"report_management.export": Permission(
    name="report_management.export",
    description="Export reports",
    category="action",
    default_min_role=Role.SeniorManager,
),
```

### 2. Create Backend Routes

```python
# backend/app/routers/admin.py
@router.get("/reports")
async def list_reports(
    current_user: Annotated[PortalUser, Depends(PermissionChecker("report_management.view"))],
    session: DBSessionDep,
):
    # Implementation
    pass

@router.post("/reports/generate")
async def generate_report(
    current_user: Annotated[PortalUser, Depends(PermissionChecker("report_management.generate"))],
    session: DBSessionDep,
    report_request: ReportRequest,
):
    # Implementation
    pass
```

### 3. Add Menu Item

```typescript
// frontend/lib/menu-config.ts
{
  href: "/dashboard/admin/reports",
  label: "Reports",
  icon: FileText,
  roles: ["SystemAdmin", "Director", "DeputyDirector", "PrincipalManager", "SeniorManager", "Manager"],
},
```

### 4. Create Frontend Page with Permission Checks

```typescript
// frontend/app/dashboard/admin/reports/page.tsx
"use client";

import { usePermission } from "@/lib/hooks/usePermissions";

export default function ReportsPage() {
  const canGenerate = usePermission("report_management.generate");
  const canExport = usePermission("report_management.export");

  return (
    <div>
      <h1>Reports</h1>
      {canGenerate && <Button>Generate Report</Button>}
      {canExport && <Button>Export Report</Button>}
    </div>
  );
}
```

## What Happens Automatically

Once permissions are added to the registry:

✅ **Permission Management UI**: New permissions automatically appear in:
   - `/dashboard/admin/permissions/roles` - Can grant/deny to roles
   - `/dashboard/admin/permissions/users/{userId}` - Can grant/deny to users

✅ **Permission API**: New permissions are immediately available via:
   - `GET /api/v1/admin/permissions` - Lists all permissions
   - `GET /api/v1/admin/permissions/check/{permission_key}` - Check permission

✅ **Default Role Hierarchy**: Permissions automatically work based on `default_min_role`:
   - Users with role ≤ `default_min_role` automatically get the permission
   - Can be overridden via role or user overrides

## Migration Path: Role-Based → Permission-Based Menus

### Current (Role-Based)
- Menu items use hardcoded `roles` array
- Menu visibility based on user's role matching roles array
- **Limitation**: Can't grant menu access to specific users/roles without code changes

### Future (Permission-Based)
- Menu items use `requiredPermission` key
- Menu visibility based on user's effective permissions
- **Benefit**: Can grant/deny menu access via admin UI without code changes

### How to Migrate

1. **Update MenuItem Interface**: Add `requiredPermission` field (keep `roles` for backward compatibility)

2. **Update Menu Items**: Replace role arrays with permission keys

```typescript
// Before
{
  href: "/dashboard/admin/users",
  label: "User Management",
  roles: ["SystemAdmin", "Director", "Manager", "Staff"],
}

// After
{
  href: "/dashboard/admin/users",
  label: "User Management",
  requiredPermission: "user_management.view",
}
```

3. **Update Filtering Logic**: Check permissions instead of roles

4. **Update Sidebar Component**: Pass user permissions to menu filter function

## Best Practices

1. **Always Define Permissions First**: Add permissions to registry before implementing features
2. **Use Consistent Naming**: Follow `{resource}_{action}` pattern
3. **Set Appropriate Default Roles**: Choose `default_min_role` based on sensitivity
4. **Protect Both Frontend and Backend**: Use permission checks in both places
5. **Document Custom Permissions**: Add comments explaining special permissions
6. **Test Permission Overrides**: Verify role and user overrides work correctly

## Permission Categories Reference

- **`menu_access`**: Controls menu item visibility
  - Example: `user_management.view`
  - Used in: Menu config, route guards

- **`route_access`**: Controls API route access
  - Example: `api.v1.admin.users.list`
  - Used in: Backend route dependencies

- **`action`**: Controls specific actions
  - Examples: `.create`, `.edit`, `.delete`, `.approve`, `.publish`
  - Used in: Button visibility, form submissions

## Common Patterns

### Pattern 1: Standard CRUD Permissions
```python
"{resource}_management.view": Permission(..., category="menu_access", default_min_role=Role.Staff),
"{resource}_management.create": Permission(..., category="action", default_min_role=Role.Manager),
"{resource}_management.edit": Permission(..., category="action", default_min_role=Role.Manager),
"{resource}_management.delete": Permission(..., category="action", default_min_role=Role.Director),
```

### Pattern 2: Approval Workflow Permissions
```python
"{resource}_management.submit": Permission(..., category="action", default_min_role=Role.Manager),
"{resource}_management.approve": Permission(..., category="action", default_min_role=Role.SeniorManager),
"{resource}_management.reject": Permission(..., category="action", default_min_role=Role.SeniorManager),
```

### Pattern 3: Special Action Permissions
```python
"{resource}_management.export": Permission(..., category="action", default_min_role=Role.Manager),
"{resource}_management.bulk_action": Permission(..., category="action", default_min_role=Role.Director),
```

## Summary

**When Adding New Models:**
1. ✅ Add permissions to `backend/app/core/permissions.py`
2. ✅ Protect routes with `PermissionChecker`
3. ✅ Add menu item to `frontend/lib/menu-config.ts` (currently role-based)
4. ✅ Use permission hooks in components for action-level controls
5. ✅ New permissions automatically appear in admin UI for management

**When Adding New Menus:**
1. ✅ Add menu item to `frontend/lib/menu-config.ts`
2. ✅ Ensure corresponding `{resource}.view` permission exists
3. ✅ (Future) Migrate to permission-based menu filtering

**Key Point**: Permissions defined in the registry are automatically available for management via the admin UI, allowing you to grant/deny them to roles and users without code changes!
