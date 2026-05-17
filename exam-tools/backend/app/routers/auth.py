from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_password
from app.dependencies.auth import CurrentUserDep, InspectorDep, InspectorJwtPostingIdDep
from app.dependencies.database import DBSessionDep
from app.models import (
    Depot,
    InspectorExamPosting,
    School,
    User,
    UserRole,
)
from app.services.active_examination import require_active_inspector_examination_id
from app.services.inspector_posting import load_postings_for_inspector_exam
from app.services.school_bulk_upload import inspector_phone_lookup_candidates


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
    """Phone and password for the active inspector examination."""

    phone_number: str
    password: str


class InspectorSelectPostingBody(BaseModel):
    posting_id: UUID


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
    """Resolved posting centre label when JWT includes ``inspector_posting_id``."""
    inspector_workspace_label: str | None = None

    @classmethod
    def from_user(
        cls,
        user: User,
        school_name: str | None = None,
        *,
        depot_code: str | None = None,
        depot_name: str | None = None,
        inspector_workspace_label: str | None = None,
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
            inspector_workspace_label=inspector_workspace_label,
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
        User.role.in_(
            (UserRole.SUPER_ADMIN, UserRole.TEST_ADMIN_OFFICER, UserRole.FINANCE_OFFICER),
        ),
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
    """Sign in with phone and password for the active inspector examination."""
    examination_id = await require_active_inspector_examination_id(session)

    phone = data.phone_number.strip()
    candidates = inspector_phone_lookup_candidates(phone)
    if not candidates:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect credentials")

    stmt = select(User).where(User.role == UserRole.INSPECTOR, User.phone_number.in_(candidates))
    result = await session.execute(stmt)
    user = result.scalars().first()
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

    if not user.hashed_password or not verify_password(data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect credentials",
        )

    postings = await load_postings_for_inspector_exam(
        session, examination_id=examination_id, inspector_user_id=user.id
    )
    if not postings:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No inspector posting for the active examination.",
        )

    token_payload: dict[str, str] = {
        "sub": str(user.id),
        "role": user.role.name,
    }
    if len(postings) == 1:
        token_payload["inspector_posting_id"] = str(postings[0].id)

    token = create_access_token(token_payload)
    return TokenResponse(
        access_token=token,
        role=user.role,
        school_code=None,
        email=user.email,
    )


@router.post("/inspector/select-posting", response_model=TokenResponse)
async def inspector_select_posting(
    body: InspectorSelectPostingBody,
    session: DBSessionDep,
    user: InspectorDep,
) -> TokenResponse:
    """Mint a new token with the chosen inspector posting for the active examination."""
    examination_id = await require_active_inspector_examination_id(session)
    posting = await session.get(InspectorExamPosting, body.posting_id)
    if (
        posting is None
        or posting.examination_id != examination_id
        or posting.inspector_user_id != user.id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid posting for this examination",
        )

    payload = {
        "sub": str(user.id),
        "role": user.role.name,
        "inspector_posting_id": str(posting.id),
    }
    token = create_access_token(payload)
    return TokenResponse(
        access_token=token,
        role=user.role,
        school_code=None,
        email=user.email,
    )


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
async def get_me(
    session: DBSessionDep,
    current_user: CurrentUserDep,
    jwt_posting_id: InspectorJwtPostingIdDep,
) -> UserMe:
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
    inspector_workspace_label: str | None = None
    if current_user.role == UserRole.INSPECTOR and jwt_posting_id is not None:
        posting = await session.get(InspectorExamPosting, jwt_posting_id)
        if posting is not None and posting.inspector_user_id == current_user.id:
            center = await session.get(School, posting.center_id)
            if center is not None:
                inspector_workspace_label = (
                    f"{center.name} ({center.code}) — {posting.subject_scope.value}"
                )
    return UserMe.from_user(
        current_user,
        school_name=school_name,
        depot_code=depot_code,
        depot_name=depot_name,
        inspector_workspace_label=inspector_workspace_label,
    )
