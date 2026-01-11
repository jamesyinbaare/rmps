"""Permission management API endpoints."""
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, status, Body, Query
from pydantic import BaseModel, Field

from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.dependencies.permissions import PermissionManagerDep
from app.models import Role, PortalUser, RolePermission, UserPermission
from app.schemas.user import UserResponse
from app.services.permission_service import (
    get_role_permissions,
    get_user_permissions,
    grant_role_permission,
    revoke_role_permission,
    grant_user_permission,
    revoke_user_permission,
    deny_role_permission,
    deny_user_permission,
    check_permission,
)
from app.core.permissions import PERMISSIONS, get_permission
from sqlalchemy import select
from sqlalchemy.orm import selectinload

router = APIRouter(prefix="/api/v1/admin/permissions", tags=["permissions"])


class PermissionResponse(BaseModel):
    """Response model for a permission."""

    key: str
    name: str
    description: str
    category: str
    default_min_role: str

    class Config:
        from_attributes = True


class RolePermissionResponse(BaseModel):
    """Response model for role permissions."""

    permission_key: str
    granted: bool
    is_override: bool  # True if this is an override, False if from hierarchy

    class Config:
        from_attributes = True


class UserPermissionResponse(BaseModel):
    """Response model for user permissions."""

    permission_key: str
    granted: bool
    is_override: bool  # True if this is a user override
    expires_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class GrantPermissionRequest(BaseModel):
    """Request model for granting a permission."""

    permission_key: str
    expires_at: datetime | None = Field(None, description="Optional expiration date for user permissions")


class DenyPermissionRequest(BaseModel):
    """Request model for explicitly denying a permission."""

    permission_key: str


@router.get("", response_model=list[PermissionResponse])
async def list_permissions() -> list[PermissionResponse]:
    """List all available permissions."""
    permissions = []
    for key, perm in PERMISSIONS.items():
        permissions.append(
            PermissionResponse(
                key=key,
                name=perm.name,
                description=perm.description,
                category=perm.category,
                default_min_role=perm.default_min_role.name,
            )
        )
    return permissions


@router.get("/roles/{role_name}", response_model=dict[str, RolePermissionResponse])
async def get_role_permissions_list(
    role_name: str,
    session: DBSessionDep,
    current_user: PermissionManagerDep,
) -> dict[str, RolePermissionResponse]:
    """Get all permissions for a specific role."""
    try:
        role = Role[role_name]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {role_name}",
        )

    # Get effective permissions (includes hierarchy)
    effective_perms = await get_role_permissions(role, session)

    # Get explicit overrides
    stmt = select(RolePermission).where(RolePermission.role == role)
    result = await session.execute(stmt)
    overrides = {rp.permission_key: rp.granted for rp in result.scalars().all()}

    # Build response
    response = {}
    for perm_key, granted in effective_perms.items():
        is_override = perm_key in overrides
        response[perm_key] = RolePermissionResponse(
            permission_key=perm_key,
            granted=granted,
            is_override=is_override,
        )

    return response


@router.post("/roles/{role_name}/grant", status_code=status.HTTP_201_CREATED)
async def grant_role_permission_endpoint(
    role_name: str,
    request: GrantPermissionRequest,
    session: DBSessionDep,
    current_user: PermissionManagerDep,
) -> RolePermissionResponse:
    """Grant a permission to a role."""
    try:
        role = Role[role_name]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {role_name}",
        )

    # Check if permission exists
    if request.permission_key not in PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission: {request.permission_key}",
        )

    try:
        role_perm = await grant_role_permission(
            role=role,
            permission_key=request.permission_key,
            session=session,
            granted_by_user_id=current_user.id,
        )
        await session.refresh(role_perm)
        return RolePermissionResponse(
            permission_key=role_perm.permission_key,
            granted=role_perm.granted,
            is_override=True,
        )
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to grant permission: {str(e)}",
        )


@router.post("/roles/{role_name}/deny", status_code=status.HTTP_201_CREATED)
async def deny_role_permission_endpoint(
    role_name: str,
    request: DenyPermissionRequest,
    session: DBSessionDep,
    current_user: PermissionManagerDep,
) -> RolePermissionResponse:
    """Explicitly deny a permission to a role (override to False)."""
    try:
        role = Role[role_name]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {role_name}",
        )

    # Check if permission exists
    if request.permission_key not in PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission: {request.permission_key}",
        )

    try:
        role_perm = await deny_role_permission(
            role=role,
            permission_key=request.permission_key,
            session=session,
            denied_by_user_id=current_user.id,
        )
        await session.refresh(role_perm)
        return RolePermissionResponse(
            permission_key=role_perm.permission_key,
            granted=role_perm.granted,
            is_override=True,
        )
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to deny permission: {str(e)}",
        )


@router.delete("/roles/{role_name}/{permission_key}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_role_permission_endpoint(
    role_name: str,
    permission_key: str,
    session: DBSessionDep,
    current_user: PermissionManagerDep,
) -> None:
    """Revoke a permission from a role (removes override, reverts to default)."""
    try:
        role = Role[role_name]
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {role_name}",
        )

    # Check if permission exists
    if permission_key not in PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission: {permission_key}",
        )

    try:
        await revoke_role_permission(
            role=role,
            permission_key=permission_key,
            session=session,
        )
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke permission: {str(e)}",
        )


@router.get("/users/{user_id}", response_model=dict[str, UserPermissionResponse])
async def get_user_permissions_list(
    user_id: UUID,
    session: DBSessionDep,
    current_user: PermissionManagerDep,
    include_expired: bool = Query(False, description="Include expired permissions"),
) -> dict[str, UserPermissionResponse]:
    """Get all effective permissions for a specific user."""
    # Get user
    stmt = select(PortalUser).where(PortalUser.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Get effective permissions
    effective_perms = await get_user_permissions(user, session, include_expired=include_expired)

    # Get explicit user overrides
    stmt = select(UserPermission).where(UserPermission.user_id == user_id)
    if not include_expired:
        # Use naive datetime for comparison (database stores naive datetimes)
        now = datetime.utcnow()
        stmt = stmt.where((UserPermission.expires_at.is_(None)) | (UserPermission.expires_at >= now))
    result = await session.execute(stmt)
    user_overrides = {up.permission_key: up for up in result.scalars().all()}

    # Get role overrides
    role_perms = await get_role_permissions(user.role, session)

    # Build response
    response = {}
    # Use naive datetime for comparison (database stores naive datetimes)
    now = datetime.utcnow() if not include_expired else None

    for perm_key in PERMISSIONS.keys():
        # Skip if user doesn't have this permission
        if perm_key not in effective_perms and perm_key not in role_perms:
            continue
        # Check user override first
        if perm_key in user_overrides:
            user_perm = user_overrides[perm_key]
            if now and user_perm.expires_at and user_perm.expires_at < now:
                # Expired, skip
                continue
            response[perm_key] = UserPermissionResponse(
                permission_key=perm_key,
                granted=user_perm.granted,
                is_override=True,
                expires_at=user_perm.expires_at,
                created_at=user_perm.created_at,
            )
        elif perm_key in role_perms:
            # Role override or default
            is_role_override = False
            stmt = select(RolePermission).where(
                RolePermission.role == user.role,
                RolePermission.permission_key == perm_key,
            )
            result = await session.execute(stmt)
            if result.scalar_one_or_none():
                is_role_override = True

            response[perm_key] = UserPermissionResponse(
                permission_key=perm_key,
                granted=role_perms[perm_key],
                is_override=is_role_override,
                expires_at=None,
                created_at=datetime.utcnow(),  # Approximate
            )
        elif perm_key in effective_perms:
            # From hierarchy only
            response[perm_key] = UserPermissionResponse(
                permission_key=perm_key,
                granted=True,
                is_override=False,
                expires_at=None,
                created_at=datetime.utcnow(),  # Approximate
            )

    return response


@router.post("/users/{user_id}/grant", status_code=status.HTTP_201_CREATED)
async def grant_user_permission_endpoint(
    user_id: UUID,
    request: GrantPermissionRequest,
    session: DBSessionDep,
    current_user: PermissionManagerDep,
) -> UserPermissionResponse:
    """Grant a permission to a user."""
    # Check if user exists
    stmt = select(PortalUser).where(PortalUser.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if permission exists
    if request.permission_key not in PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission: {request.permission_key}",
        )

    try:
        user_perm = await grant_user_permission(
            user_id=user_id,
            permission_key=request.permission_key,
            session=session,
            granted_by_user_id=current_user.id,
            expires_at=request.expires_at,
        )
        await session.refresh(user_perm)
        return UserPermissionResponse(
            permission_key=user_perm.permission_key,
            granted=user_perm.granted,
            is_override=True,
            expires_at=user_perm.expires_at,
            created_at=user_perm.created_at,
        )
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to grant permission: {str(e)}",
        )


@router.post("/users/{user_id}/deny", status_code=status.HTTP_201_CREATED)
async def deny_user_permission_endpoint(
    user_id: UUID,
    request: DenyPermissionRequest,
    session: DBSessionDep,
    current_user: PermissionManagerDep,
) -> UserPermissionResponse:
    """Explicitly deny a permission to a user (override to False)."""
    # Check if user exists
    stmt = select(PortalUser).where(PortalUser.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if permission exists
    if request.permission_key not in PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission: {request.permission_key}",
        )

    try:
        user_perm = await deny_user_permission(
            user_id=user_id,
            permission_key=request.permission_key,
            session=session,
            denied_by_user_id=current_user.id,
        )
        await session.refresh(user_perm)
        return UserPermissionResponse(
            permission_key=user_perm.permission_key,
            granted=user_perm.granted,
            is_override=True,
            expires_at=user_perm.expires_at,
            created_at=user_perm.created_at,
        )
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to deny permission: {str(e)}",
        )


@router.delete("/users/{user_id}/{permission_key}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_user_permission_endpoint(
    user_id: UUID,
    permission_key: str,
    session: DBSessionDep,
    current_user: PermissionManagerDep,
) -> None:
    """Revoke a permission from a user (removes override, reverts to role/default)."""
    # Check if user exists
    stmt = select(PortalUser).where(PortalUser.id == user_id)
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Check if permission exists
    if permission_key not in PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission: {permission_key}",
        )

    try:
        await revoke_user_permission(
            user_id=user_id,
            permission_key=permission_key,
            session=session,
        )
    except Exception as e:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke permission: {str(e)}",
        )


@router.get("/check/{permission_key}", response_model=dict[str, bool])
async def check_user_permission(
    permission_key: str,
    session: DBSessionDep,
    current_user: CurrentUserDep,
) -> dict[str, bool]:
    """Check if the current user has a specific permission."""
    # Check if permission exists
    if permission_key not in PERMISSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown permission: {permission_key}",
        )

    has_permission = await check_permission(
        user=current_user,
        permission_key=permission_key,
        session=session,
    )

    return {"has_permission": has_permission}
