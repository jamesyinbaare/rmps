from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_password
from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import Depot, School, User, UserRole


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: UserRole
    school_code: str | None = None
    email: EmailStr | None = None


class SuperAdminLoginRequest(BaseModel):
    email: EmailStr
    password: str


class SupervisorLoginRequest(BaseModel):
    school_code: str
    password: str


class InspectorLoginRequest(BaseModel):
    school_code: str
    phone_number: str


class DepotKeeperLoginRequest(BaseModel):
    username: str
    password: str


class UserMe(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr | None = None
    username: str | None = None
    school_code: str | None = None
    school_name: str | None = None
    phone_number: str | None = None
    role: str
    depot_id: UUID | None = None
    depot_code: str | None = None
    depot_name: str | None = None

    @classmethod
    def from_user(
        cls,
        user: User,
        school_name: str | None = None,
        *,
        depot_code: str | None = None,
        depot_name: str | None = None,
    ) -> "UserMe":
        return cls(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            username=user.username,
            school_code=user.school_code,
            school_name=school_name,
            phone_number=user.phone_number,
            role=user.role.name,
            depot_id=user.depot_id,
            depot_code=depot_code,
            depot_name=depot_name,
        )


router = APIRouter(prefix="/auth", tags=["auth"])


async def _get_user_by_stmt(session: AsyncSession, stmt: Any) -> User:
    result = await session.execute(stmt)
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return user


def _make_token_response(user: User) -> TokenResponse:
    payload = {"sub": str(user.id), "role": user.role.name}
    token = create_access_token(payload)
    return TokenResponse(
        access_token=token,
        role=user.role,
        school_code=user.school_code,
        email=user.email,
    )


@router.post("/super-admin/login", response_model=TokenResponse)
async def super_admin_login(
    data: SuperAdminLoginRequest,
    session: DBSessionDep,
) -> TokenResponse:
    stmt = select(User).where(
        User.email == data.email,
        User.role.in_((UserRole.SUPER_ADMIN, UserRole.TEST_ADMIN_OFFICER)),
    )
    user = await _get_user_by_stmt(session, stmt)

    if not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials",
        )

    return _make_token_response(user)


@router.post("/supervisor/login", response_model=TokenResponse)
async def supervisor_login(
    data: SupervisorLoginRequest,
    session: DBSessionDep,
) -> TokenResponse:
    stmt = select(User).where(User.role == UserRole.SUPERVISOR, User.school_code == data.school_code)
    user = await _get_user_by_stmt(session, stmt)

    if not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials",
        )

    return _make_token_response(user)


@router.post("/inspector/login", response_model=TokenResponse)
async def inspector_login(
    data: InspectorLoginRequest,
    session: DBSessionDep,
) -> TokenResponse:
    stmt = select(User).where(
        User.role == UserRole.INSPECTOR,
        User.school_code == data.school_code,
        User.phone_number == data.phone_number,
    )
    user = await _get_user_by_stmt(session, stmt)
    return _make_token_response(user)


@router.post("/depot-keeper/login", response_model=TokenResponse)
async def depot_keeper_login(
    data: DepotKeeperLoginRequest,
    session: DBSessionDep,
) -> TokenResponse:
    uname = data.username.strip()
    stmt = select(User).where(User.role == UserRole.DEPOT_KEEPER, User.username == uname)
    user = await _get_user_by_stmt(session, stmt)

    if not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials",
        )

    return _make_token_response(user)


@router.get("/me", response_model=UserMe)
async def get_me(session: DBSessionDep, current_user: CurrentUserDep) -> UserMe:
    school_name: str | None = None
    if current_user.school_code:
        sch_stmt = select(School).where(School.code == current_user.school_code)
        sch_result = await session.execute(sch_stmt)
        school = sch_result.scalar_one_or_none()
        if school is not None:
            school_name = school.name
    depot_code: str | None = None
    depot_name: str | None = None
    if current_user.depot_id is not None:
        dep = await session.get(Depot, current_user.depot_id)
        if dep is not None:
            depot_code = dep.code
            depot_name = dep.name
    return UserMe.from_user(
        current_user,
        school_name=school_name,
        depot_code=depot_code,
        depot_name=depot_name,
    )
