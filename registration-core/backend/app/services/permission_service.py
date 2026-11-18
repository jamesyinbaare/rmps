"""Permission service for checking user and role permissions."""
from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import PortalUser, Role, RolePermission, UserPermission
from app.core.permissions import PERMISSIONS, get_permission


async def check_permission(
    user: PortalUser,
    permission_key: str,
    session: AsyncSession,
) -> bool:
    """
    Check if a user has a specific permission.

    Resolution order:
    1. User-level permission override (highest priority)
    2. Role-level permission override
    3. Role hierarchy (default behavior)

    Args:
        user: The user to check permissions for
        permission_key: The permission key to check
        session: Database session

    Returns:
        True if user has permission, False otherwise
    """
    # 1. Check user-level permission override (explicit grant/deny)
    user_perm_stmt = select(UserPermission).where(
        and_(
            UserPermission.user_id == user.id,
            UserPermission.permission_key == permission_key,
        )
    )
    user_perm_result = await session.execute(user_perm_stmt)
    user_perm = user_perm_result.scalar_one_or_none()

    if user_perm is not None:
        # Check if permission has expired
        # Use naive datetime for comparison (database stores naive datetimes)
        if user_perm.expires_at and user_perm.expires_at < datetime.utcnow():
            # Permission expired, fall through to role-level check
            pass
        else:
            return user_perm.granted

    # 2. Check role-level permission override
    role_perm_stmt = select(RolePermission).where(
        and_(
            RolePermission.role == user.role,
            RolePermission.permission_key == permission_key,
        )
    )
    role_perm_result = await session.execute(role_perm_stmt)
    role_perm = role_perm_result.scalar_one_or_none()

    if role_perm is not None:
        return role_perm.granted

    # 3. Check role hierarchy (default behavior)
    permission_def = get_permission(permission_key)
    if permission_def is None:
        # Unknown permission, default to False for security
        return False

    # User has permission if their role is equal to or higher than the default minimum role
    # (lower value = higher privilege)
    return user.role <= permission_def.default_min_role


async def get_user_permissions(
    user: PortalUser,
    session: AsyncSession,
    include_expired: bool = False,
) -> set[str]:
    """
    Get all permissions for a user (effective permissions).

    Args:
        user: The user to get permissions for
        session: Database session
        include_expired: Whether to include expired permissions

    Returns:
        Set of permission keys the user has
    """
    permissions: set[str] = set()
    # Use naive datetime for comparison (database stores naive datetimes)
    now = datetime.utcnow()

    # Get all user-level permissions
    user_perm_stmt = select(UserPermission).where(
        UserPermission.user_id == user.id
    )
    user_perm_result = await session.execute(user_perm_stmt)
    user_perms = user_perm_result.scalars().all()

    user_perms_dict: dict[str, bool] = {}
    for user_perm in user_perms:
        if user_perm.expires_at and user_perm.expires_at < now:
            if not include_expired:
                continue
        if user_perm.granted:
            user_perms_dict[user_perm.permission_key] = True
        else:
            # Explicit denial - remember this
            user_perms_dict[user_perm.permission_key] = False

    # Get all role-level permissions
    role_perm_stmt = select(RolePermission).where(
        RolePermission.role == user.role
    )
    role_perm_result = await session.execute(role_perm_stmt)
    role_perms = role_perm_result.scalars().all()

    role_perms_dict: dict[str, bool] = {}
    for role_perm in role_perms:
        if role_perm.granted:
            role_perms_dict[role_perm.permission_key] = True
        else:
            # Explicit denial
            role_perms_dict[role_perm.permission_key] = False

    # Check all registered permissions
    for permission_key, permission_def in PERMISSIONS.items():
        # 1. Check user-level override first
        if permission_key in user_perms_dict:
            if user_perms_dict[permission_key]:
                permissions.add(permission_key)
            # If False, user explicitly denied, so don't add
            continue

        # 2. Check role-level override
        if permission_key in role_perms_dict:
            if role_perms_dict[permission_key]:
                permissions.add(permission_key)
            # If False, role explicitly denied, so don't add
            continue

        # 3. Check role hierarchy (default)
        if user.role <= permission_def.default_min_role:
            permissions.add(permission_key)

    return permissions


async def get_role_permissions(
    role: Role,
    session: AsyncSession,
) -> dict[str, bool]:
    """
    Get all permissions for a role (including overrides and defaults).

    Args:
        role: The role to get permissions for
        session: Database session

    Returns:
        Dictionary mapping permission keys to whether they're granted
    """
    permissions: dict[str, bool] = {}

    # Get role-level overrides
    role_perm_stmt = select(RolePermission).where(
        RolePermission.role == role
    )
    role_perm_result = await session.execute(role_perm_stmt)
    role_perms = role_perm_result.scalars().all()

    role_perms_dict: dict[str, bool] = {}
    for role_perm in role_perms:
        role_perms_dict[role_perm.permission_key] = role_perm.granted

    # Check all registered permissions
    for permission_key, permission_def in PERMISSIONS.items():
        # Check role-level override first
        if permission_key in role_perms_dict:
            permissions[permission_key] = role_perms_dict[permission_key]
        else:
            # Use default role hierarchy
            permissions[permission_key] = role <= permission_def.default_min_role

    return permissions


async def grant_role_permission(
    role: Role,
    permission_key: str,
    session: AsyncSession,
    granted_by_user_id: UUID | None = None,
) -> RolePermission:
    """
    Grant a permission to a role.

    Args:
        role: The role to grant permission to
        permission_key: The permission key to grant
        session: Database session
        granted_by_user_id: ID of user granting the permission

    Returns:
        The created or updated RolePermission
    """
    # Check if permission exists
    if permission_key not in PERMISSIONS:
        raise ValueError(f"Unknown permission: {permission_key}")

    # Check if already exists
    stmt = select(RolePermission).where(
        and_(
            RolePermission.role == role,
            RolePermission.permission_key == permission_key,
        )
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.granted = True
        if granted_by_user_id:
            existing.created_by_user_id = granted_by_user_id
        await session.commit()
        await session.refresh(existing)
        return existing

    # Create new
    role_perm = RolePermission(
        role=role,
        permission_key=permission_key,
        granted=True,
        created_by_user_id=granted_by_user_id,
    )
    session.add(role_perm)
    await session.commit()
    await session.refresh(role_perm)
    return role_perm


async def revoke_role_permission(
    role: Role,
    permission_key: str,
    session: AsyncSession,
) -> None:
    """
    Revoke a permission from a role (removes the override, reverting to default).

    Args:
        role: The role to revoke permission from
        permission_key: The permission key to revoke
        session: Database session
    """
    stmt = select(RolePermission).where(
        and_(
            RolePermission.role == role,
            RolePermission.permission_key == permission_key,
        )
    )
    result = await session.execute(stmt)
    role_perm = result.scalar_one_or_none()

    if role_perm:
        await session.delete(role_perm)
        await session.commit()


async def grant_user_permission(
    user_id: UUID,
    permission_key: str,
    session: AsyncSession,
    granted_by_user_id: UUID | None = None,
    expires_at: datetime | None = None,
) -> UserPermission:
    """
    Grant a permission to a user.

    Args:
        user_id: ID of the user to grant permission to
        permission_key: The permission key to grant
        session: Database session
        granted_by_user_id: ID of user granting the permission
        expires_at: Optional expiration datetime

    Returns:
        The created or updated UserPermission
    """
    # Check if permission exists
    if permission_key not in PERMISSIONS:
        raise ValueError(f"Unknown permission: {permission_key}")

    # Check if already exists
    stmt = select(UserPermission).where(
        and_(
            UserPermission.user_id == user_id,
            UserPermission.permission_key == permission_key,
        )
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    # Convert expires_at to naive datetime if it's timezone-aware (database stores naive)
    if expires_at and expires_at.tzinfo is not None:
        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)

    if existing:
        existing.granted = True
        existing.expires_at = expires_at
        if granted_by_user_id:
            existing.created_by_user_id = granted_by_user_id
        await session.commit()
        await session.refresh(existing)
        return existing

    # Create new
    user_perm = UserPermission(
        user_id=user_id,
        permission_key=permission_key,
        granted=True,
        created_by_user_id=granted_by_user_id,
        expires_at=expires_at,
    )
    session.add(user_perm)
    await session.commit()
    await session.refresh(user_perm)
    return user_perm


async def revoke_user_permission(
    user_id: UUID,
    permission_key: str,
    session: AsyncSession,
) -> None:
    """
    Revoke a permission from a user (removes the override, reverting to role/default).

    Args:
        user_id: ID of the user to revoke permission from
        permission_key: The permission key to revoke
        session: Database session
    """
    stmt = select(UserPermission).where(
        and_(
            UserPermission.user_id == user_id,
            UserPermission.permission_key == permission_key,
        )
    )
    result = await session.execute(stmt)
    user_perm = result.scalar_one_or_none()

    if user_perm:
        await session.delete(user_perm)
        await session.commit()


async def deny_role_permission(
    role: Role,
    permission_key: str,
    session: AsyncSession,
    denied_by_user_id: UUID | None = None,
) -> RolePermission:
    """
    Explicitly deny a permission to a role (override to False).

    Args:
        role: The role to deny permission to
        permission_key: The permission key to deny
        session: Database session
        denied_by_user_id: ID of user denying the permission

    Returns:
        The created or updated RolePermission
    """
    # Check if permission exists
    if permission_key not in PERMISSIONS:
        raise ValueError(f"Unknown permission: {permission_key}")

    # Check if already exists
    stmt = select(RolePermission).where(
        and_(
            RolePermission.role == role,
            RolePermission.permission_key == permission_key,
        )
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.granted = False
        if denied_by_user_id:
            existing.created_by_user_id = denied_by_user_id
        await session.commit()
        await session.refresh(existing)
        return existing

    # Create new denial
    role_perm = RolePermission(
        role=role,
        permission_key=permission_key,
        granted=False,
        created_by_user_id=denied_by_user_id,
    )
    session.add(role_perm)
    await session.commit()
    await session.refresh(role_perm)
    return role_perm


async def deny_user_permission(
    user_id: UUID,
    permission_key: str,
    session: AsyncSession,
    denied_by_user_id: UUID | None = None,
) -> UserPermission:
    """
    Explicitly deny a permission to a user (override to False).

    Args:
        user_id: ID of the user to deny permission to
        permission_key: The permission key to deny
        session: Database session
        denied_by_user_id: ID of user denying the permission

    Returns:
        The created or updated UserPermission
    """
    # Check if permission exists
    if permission_key not in PERMISSIONS:
        raise ValueError(f"Unknown permission: {permission_key}")

    # Check if already exists
    stmt = select(UserPermission).where(
        and_(
            UserPermission.user_id == user_id,
            UserPermission.permission_key == permission_key,
        )
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()

    if existing:
        existing.granted = False
        if denied_by_user_id:
            existing.created_by_user_id = denied_by_user_id
        await session.commit()
        await session.refresh(existing)
        return existing

    # Create new denial
    user_perm = UserPermission(
        user_id=user_id,
        permission_key=permission_key,
        granted=False,
        created_by_user_id=denied_by_user_id,
    )
    session.add(user_perm)
    await session.commit()
    await session.refresh(user_perm)
    return user_perm
