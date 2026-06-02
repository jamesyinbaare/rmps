"""Sort order for admin exam centre officials list."""

from app.routers.admin_exam_officials import _official_order_by


def test_official_order_by_center_code() -> None:
    asc = _official_order_by("center_code", "asc")
    assert len(asc) == 2
    assert "code" in str(asc[0]).lower()
    assert "full_name" in str(asc[1]).lower()

    desc = _official_order_by("center_code", "desc")
    assert "DESC" in str(desc[0]).upper() or "desc" in str(desc[0]).lower()


def test_official_order_by_full_name() -> None:
    asc = _official_order_by("full_name", "asc")
    assert len(asc) == 2
    assert "full_name" in str(asc[0]).lower()
    assert "code" in str(asc[1]).lower()


def test_official_order_by_num_days() -> None:
    asc = _official_order_by("num_days", "asc")
    assert len(asc) == 3
    assert "num_days" in str(asc[0]).lower()
    assert "code" in str(asc[1]).lower()
    assert "full_name" in str(asc[2]).lower()

    desc = _official_order_by("num_days", "desc")
    assert "num_days" in str(desc[0]).lower()
    assert "DESC" in str(desc[0]).upper() or "desc" in str(desc[0]).lower()
