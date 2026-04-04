from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_password
from app.dependencies.auth import CurrentUserDep
from app.dependencies.database import DBSessionDep
from app.models import User, UserRole


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


class UserMe(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr | None = None
    school_code: str | None = None
    phone_number: str | None = None
    role: str

    @classmethod
    def from_user(cls, user: User) -> "UserMe":
        return cls(
            id=user.id,
            full_name=user.full_name,
            email=user.email,
            school_code=user.school_code,
            phone_number=user.phone_number,
            role=user.role.name,
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
    stmt = select(User).where(User.role == UserRole.SUPER_ADMIN, User.email == data.email)
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


@router.get("/me", response_model=UserMe)
async def get_me(current_user: CurrentUserDep) -> UserMe:
    return UserMe.from_user(current_user)
