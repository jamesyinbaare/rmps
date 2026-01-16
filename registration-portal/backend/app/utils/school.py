"""Utility functions for school operations."""

from app.models import School


def check_school_profile_completion(school: School) -> bool:
    """
    Check if a school profile is complete.

    A profile is considered complete when all required fields are non-null and non-empty:
    - email
    - phone
    - digital_address
    - post_office_address
    - is_private (must be explicitly set to True or False, not None)
    - principal_name
    - principal_email
    - principal_phone

    Args:
        school: School instance to check

    Returns:
        True if profile is complete, False otherwise
    """
    # Check all required fields are non-null and non-empty (for strings)
    # and is_private is explicitly set (not None)
    required_fields = [
        school.email,
        school.phone,
        school.digital_address,
        school.post_office_address,
        school.principal_name,
        school.principal_email,
        school.principal_phone,
    ]

    # Check string fields are non-null and non-empty
    for field in required_fields:
        if not field or not field.strip():
            return False

    # Check is_private is explicitly set (not None)
    if school.is_private is None:
        return False

    return True
