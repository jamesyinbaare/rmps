"""Centre location service and authorization helpers."""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.models import CentreLocationSource, UserRole
from app.services.centre_location_service import (
    normalize_centre_code,
    upsert_centre_location,
    validate_coordinates,
)


def test_normalize_centre_code_uppercases() -> None:
    assert normalize_centre_code("  abc01  ") == "ABC01"


def test_validate_coordinates_rejects_outside_ghana() -> None:
    with pytest.raises(HTTPException) as exc:
        validate_coordinates(51.5, -0.1)
    assert exc.value.status_code == 400


def test_validate_coordinates_accepts_accra_area() -> None:
    validate_coordinates(5.6, -0.2)


@pytest.mark.asyncio
async def test_upsert_creates_new_row() -> None:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()

    with patch(
        "app.services.centre_location_service.get_location_by_code",
        new_callable=AsyncMock,
        return_value=None,
    ):
        row = await upsert_centre_location(
            session,
            centre_code="h001",
            latitude=5.6,
            longitude=-0.18,
            source=CentreLocationSource.INSPECTOR_GPS,
            captured_by_user_id=uuid4(),
            accuracy_m=12.0,
        )
        session.add.assert_called_once()
        assert row.centre_code == "H001"
        assert row.latitude == Decimal("5.6")


@pytest.mark.asyncio
async def test_upsert_updates_existing_row() -> None:
    session = AsyncMock()
    session.flush = AsyncMock()
    existing = MagicMock()
    existing.centre_code = "H001"

    with patch(
        "app.services.centre_location_service.get_location_by_code",
        new_callable=AsyncMock,
        return_value=existing,
    ):
        row = await upsert_centre_location(
            session,
            centre_code="H001",
            latitude=5.61,
            longitude=-0.19,
            source=CentreLocationSource.ADMIN_MANUAL,
            captured_by_user_id=uuid4(),
        )
        assert row is existing
        assert existing.latitude == Decimal("5.61")


@pytest.mark.asyncio
async def test_authorize_inspector_wrong_centre_forbidden() -> None:
    from app.routers.centre_locations import _authorize_centre_location_write

    user = MagicMock()
    user.id = uuid4()
    user.role = UserRole.INSPECTOR

    centre_id = uuid4()
    other_centre = uuid4()
    ctx = MagicMock()
    ctx.examination_centre.id = other_centre

    with patch(
        "app.routers.centre_locations.load_examination_or_raise",
        new_callable=AsyncMock,
    ), patch(
        "app.routers.centre_locations.resolve_inspector_workspace",
        new_callable=AsyncMock,
        return_value=ctx,
    ):
        session = AsyncMock()
        with pytest.raises(HTTPException) as exc:
            await _authorize_centre_location_write(
                session,
                examination_id=1,
                centre_id=centre_id,
                user=user,
                jwt_posting_id=uuid4(),
            )
        assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_location_to_dict_none() -> None:
    from app.services.centre_location_service import location_to_dict

    assert location_to_dict(None) is None
