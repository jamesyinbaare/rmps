"""Region filter matching for admin exam centre officials."""

from app.models import Region
from app.routers.admin_exam_officials import _parse_region_filter


def test_parse_region_filter_accepts_display_value_and_enum_name() -> None:
    assert _parse_region_filter("Upper East") == Region.UPPER_EAST
    assert _parse_region_filter("UPPER_EAST") == Region.UPPER_EAST
    assert _parse_region_filter("upper east") == Region.UPPER_EAST
