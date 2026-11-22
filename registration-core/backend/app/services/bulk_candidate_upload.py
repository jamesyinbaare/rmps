"""Shared bulk candidate upload processing with per-request caches."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    PortalUser,
    Programme,
    RegistrationCandidate,
    RegistrationExam,
    RegistrationStatus,
    RegistrationSubjectSelection,
    RegistrationType,
    Subject,
    school_programmes,
)
from app.schemas.registration import BulkUploadError, BulkUploadResponse
from app.services.exam_eligibility_service import school_allows_free_tvet_for_exam
from app.services.exam_kind_service import (
    is_private_exam,
    resolve_examination_center,
    validate_registration_type_for_exam,
)
from app.services.registration_completeness import default_fee_payment_status
from app.services.subject_selection import (
    get_programme_subjects_for_registration,
    validate_subject_selections,
)
from app.utils.registration import generate_unique_registration_number

OPTION_ALIASES = {
    "SOC": "C702",
    "C702": "C702",
    "702": "C702",
    "ENT": "C705",
    "C705": "C705",
    "705": "C705",
}

# Tokens accepted when matching a programme subject code / original_code
OPTION_MATCH_TOKENS: dict[str, set[str]] = {
    "C702": {"SOC", "C702", "702"},
    "C705": {"ENT", "C705", "705"},
}


def option_match_tokens(option_value: str) -> set[str] | None:
    """Return uppercase match tokens for a sheet option value, or None if invalid."""
    resolved = OPTION_ALIASES.get(option_value.strip().upper())
    if not resolved:
        return None
    return set(OPTION_MATCH_TOKENS.get(resolved, {resolved}))


def subject_matches_option_tokens(subject: Subject, tokens: set[str]) -> bool:
    """True if subject code or original_code matches any option token (case-insensitive)."""
    codes = {subject.code.strip().upper()} if subject.code else set()
    if subject.original_code:
        codes.add(subject.original_code.strip().upper())
    return bool(codes & tokens)


def _phone_digits_from_excel(raw: object) -> str | None:
    """Normalize Excel/pandas phone cell to digit string (no spaces/dashes)."""
    if raw is None:
        return None
    if isinstance(raw, bool):
        return None
    if isinstance(raw, float):
        if raw != raw:  # NaN
            return None
        # Excel often stores 0244123456 as 244123456.0
        if raw == int(raw):
            return str(int(raw))
        text = str(raw).strip()
    elif isinstance(raw, int):
        return str(raw)
    else:
        text = str(raw).strip()
    if not text or text.lower() in {"nan", "none"}:
        return None
    # pandas/str(float) → "244123456.0"
    if re.fullmatch(r"\d+\.0+", text):
        text = text.split(".", 1)[0]
    # scientific notation from Excel for long numbers
    if re.fullmatch(r"\d+(\.\d+)?[eE][+-]?\d+", text):
        try:
            as_float = float(text)
            if as_float == int(as_float):
                return str(int(as_float))
        except ValueError:
            pass
    return re.sub(r"[\s\-]", "", text) or None


def normalize_ghana_phone(raw: object) -> str | None:
    """Return 10-digit local Ghana number or None if empty. Raises ValueError if invalid."""
    cleaned = _phone_digits_from_excel(raw)
    if cleaned is None:
        return None
    # Excel number format drops the leading 0 → restore when we have 9 digits
    if re.fullmatch(r"[2-9]\d{8}", cleaned):
        cleaned = "0" + cleaned
    if not re.fullmatch(r"0\d{9}", cleaned):
        raise ValueError(cleaned)
    return cleaned


def parse_bulk_date_of_birth(raw: object) -> date | None:
    """Parse DD/MM/YYYY strings, or Excel datetime/date cells."""
    if raw is None:
        return None
    if isinstance(raw, float) and raw != raw:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if isinstance(raw, date):
        return raw
    if hasattr(raw, "date") and not isinstance(raw, (str, bytes)):
        try:
            return raw.date()  # type: ignore[no-any-return]
        except Exception:
            return None
    text = str(raw).strip()
    if not text or text.lower() == "nan":
        return None
    try:
        return datetime.strptime(text, "%d/%m/%Y").date()
    except ValueError:
        return None


def _cell(row: dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in row and row[key] is not None and str(row[key]).strip() != "":
            return row[key]
        # case-insensitive fallback
        key_lower = key.lower()
        for rk, rv in row.items():
            if str(rk).lower() == key_lower and rv is not None and str(rv).strip() != "":
                return rv
    return default


def _str_or_none(raw: object) -> str | None:
    if raw is None:
        return None
    text = str(raw).strip()
    if not text or text.lower() == "nan":
        return None
    return text


async def process_bulk_candidate_rows(
    session: AsyncSession,
    *,
    exam: RegistrationExam,
    current_user: PortalUser,
    rows: list[dict[str, Any]],
    default_registration_type: str | None = None,
    commit: bool = True,
    dry_run: bool = False,
) -> BulkUploadResponse:
    """
    Process candidate rows (already normalized dicts with row_number).

    Each row should include spreadsheet-like keys (firstname, lastname, …)
    plus integer `row_number` for error reporting.

    When dry_run=True, run the same validation and count would-be successes
    without creating candidates or generating registration numbers.
    """
    if current_user.school_id is None:
        raise HTTPException(status_code=403, detail="User must be associated with a school")

    school_id = current_user.school_id
    exam_id = exam.id

    allows_free_tvet_bulk = await school_allows_free_tvet_for_exam(
        session, exam_id, school_id
    )

    # Per-request caches
    programme_by_code: dict[str, Programme | None] = {}
    school_programme_ok: dict[int, bool] = {}
    subjects_info_by_programme: dict[int, dict[str, Any]] = {}
    subject_by_code: dict[str, Subject | None] = {}
    subject_by_original_code: dict[str, Subject | None] = {}
    subject_by_id: dict[int, Subject] = {}

    async def get_programme(code: str) -> Programme | None:
        if code not in programme_by_code:
            result = await session.execute(select(Programme).where(Programme.code == code))
            programme_by_code[code] = result.scalar_one_or_none()
        return programme_by_code[code]

    async def programme_available(programme_id: int) -> bool:
        if programme_id not in school_programme_ok:
            result = await session.execute(
                select(school_programmes).where(
                    school_programmes.c.school_id == school_id,
                    school_programmes.c.programme_id == programme_id,
                )
            )
            school_programme_ok[programme_id] = result.first() is not None
        return school_programme_ok[programme_id]

    async def get_subjects_info(programme_id: int) -> dict[str, Any]:
        if programme_id not in subjects_info_by_programme:
            subjects_info_by_programme[programme_id] = (
                await get_programme_subjects_for_registration(session, programme_id)
            )
            # Warm subject_by_id for compulsory/elective/optional ids
            info = subjects_info_by_programme[programme_id]
            ids: set[int] = set(info["compulsory_core"]) | set(info["electives"])
            for group_ids in info["optional_core_groups"].values():
                ids.update(group_ids)
            missing = [i for i in ids if i not in subject_by_id]
            if missing:
                result = await session.execute(select(Subject).where(Subject.id.in_(missing)))
                for subj in result.scalars().all():
                    subject_by_id[subj.id] = subj
                    subject_by_code[subj.code] = subj
        return subjects_info_by_programme[programme_id]

    async def get_subject_by_code(code: str) -> Subject | None:
        # Do not permanently cache misses — programme warm-up may populate later
        if code in subject_by_code and subject_by_code[code] is not None:
            return subject_by_code[code]
        result = await session.execute(select(Subject).where(Subject.code == code))
        subj = result.scalar_one_or_none()
        if subj:
            subject_by_code[code] = subj
            subject_by_id[subj.id] = subj
        elif code not in subject_by_code:
            subject_by_code[code] = None
        return subject_by_code.get(code)

    async def get_subject_by_original_or_code(code: str) -> Subject | None:
        if code in subject_by_original_code and subject_by_original_code[code] is not None:
            return subject_by_original_code[code]
        result = await session.execute(
            select(Subject).where(Subject.original_code == code)
        )
        subj = result.scalar_one_or_none()
        if subj:
            subject_by_original_code[code] = subj
            subject_by_id[subj.id] = subj
            subject_by_code[subj.code] = subj
            return subj
        subject_by_original_code[code] = None
        return await get_subject_by_code(code)

    async def resolve_option_subject(
        programme_id: int, option_value: str
    ) -> Subject | None:
        """Match SOC/ENT/C702/C705 against programme optional-core (then electives/global)."""
        tokens = option_match_tokens(option_value)
        if not tokens:
            return None
        resolved_code = OPTION_ALIASES[option_value.strip().upper()]
        subjects_info = await get_subjects_info(programme_id)

        def pick_from_ids(ids: list[int]) -> Subject | None:
            for sid in ids:
                subj = subject_by_id.get(sid)
                if subj and subject_matches_option_tokens(subj, tokens):
                    return subj
            return None

        # Prefer optional-core choice groups (SOC/ENT pick-one)
        for group_ids in subjects_info["optional_core_groups"].values():
            found = pick_from_ids(group_ids)
            if found:
                return found

        # Then electives on the programme
        found = pick_from_ids(subjects_info["electives"])
        if found:
            return found

        # Global catalog fallback by original_code then code
        for token in sorted(tokens, key=len, reverse=True):
            found = await get_subject_by_original_or_code(token)
            if found and subject_matches_option_tokens(found, tokens):
                return found
        return await get_subject_by_original_or_code(resolved_code)

    successful = 0
    failed = 0
    errors: list[BulkUploadError] = []

    for row in rows:
        row_number = int(row.get("row_number") or 0)
        try:
            firstname_str = _str_or_none(_cell(row, "firstname")) or ""
            lastname_str = _str_or_none(_cell(row, "lastname")) or ""
            othername = _str_or_none(_cell(row, "othername"))

            if not firstname_str:
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message="Add firstname.",
                        field="firstname",
                    )
                )
                failed += 1
                continue
            if not lastname_str:
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message="Add lastname.",
                        field="lastname",
                    )
                )
                failed += 1
                continue

            dob_raw = _cell(row, "date_of_birth", "dob")
            date_of_birth = (
                parse_bulk_date_of_birth(dob_raw) if dob_raw is not None else None
            )
            if date_of_birth is None:
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message="Use date_of_birth as DD/MM/YYYY (e.g. 15/01/2005).",
                        field="date_of_birth",
                    )
                )
                failed += 1
                continue

            gender = _str_or_none(_cell(row, "gender"))
            if not gender:
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message="Add gender (e.g. M or F).",
                        field="gender",
                    )
                )
                failed += 1
                continue

            programme_code = _str_or_none(_cell(row, "programme_code", "programme"))

            optional_subjects_str = _str_or_none(
                _cell(row, "optional_subjects", "optional subjects")
            )
            optional_subject_codes: list[str] = []
            if optional_subjects_str:
                optional_subject_codes = [
                    s.strip()
                    for s in optional_subjects_str.split(",")
                    if s.strip()
                ]

            contact_email = _str_or_none(_cell(row, "contact_email", "email"))
            try:
                contact_phone = normalize_ghana_phone(
                    _cell(row, "contact_phone", "phone")
                )
            except ValueError:
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message=(
                            "contact_phone must be a 10-digit Ghana number starting with 0 "
                            "(e.g. 0244123456), without country code."
                        ),
                        field="contact_phone",
                    )
                )
                failed += 1
                continue

            address = _str_or_none(_cell(row, "address"))
            national_id = _str_or_none(_cell(row, "national_id", "national id"))
            guardian_name = _str_or_none(_cell(row, "guardian_name", "guardian name"))
            try:
                guardian_phone = normalize_ghana_phone(
                    _cell(row, "guardian_phone", "guardian phone")
                )
            except ValueError:
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message=(
                            "guardian_phone must be a 10-digit Ghana number starting with 0 "
                            "(e.g. 0244123456), without country code."
                        ),
                        field="guardian_phone",
                    )
                )
                failed += 1
                continue

            guardian_digital_address = _str_or_none(
                _cell(row, "guardian_digital_address", "guardian digital address")
            )
            guardian_national_id = _str_or_none(
                _cell(row, "guardian_national_id", "guardian national id")
            )
            disability = _str_or_none(_cell(row, "disability"))
            file_registration_type = _str_or_none(
                _cell(row, "registration_type", "registration type")
            )

            center_id_raw = _cell(
                row, "school_id", "examination_center", "examination center", "center_id"
            )
            file_center_id = None
            if center_id_raw is not None:
                try:
                    file_center_id = int(str(center_id_raw).strip())
                except (TypeError, ValueError):
                    errors.append(
                        BulkUploadError(
                            row_number=row_number,
                            error_message=(
                                f'examination_center must be a school id number. '
                                f'You entered "{center_id_raw}".'
                            ),
                            field="examination_center",
                        )
                    )
                    failed += 1
                    continue

            try:
                if is_private_exam(exam):
                    candidate_registration_type = validate_registration_type_for_exam(
                        exam,
                        file_registration_type
                        or default_registration_type
                        or RegistrationType.PRIVATE.value,
                        is_school_registration=True,
                    )
                    center = await resolve_examination_center(
                        session,
                        school_id=file_center_id,
                        registering_school_id=school_id,
                    )
                    candidate_school_id = center.id
                else:
                    default_type = (
                        RegistrationType.FREE_TVET.value
                        if allows_free_tvet_bulk
                        else RegistrationType.REGULAR.value
                    )
                    candidate_registration_type = validate_registration_type_for_exam(
                        exam,
                        file_registration_type
                        or default_registration_type
                        or default_type,
                        is_school_registration=True,
                        allows_free_tvet=allows_free_tvet_bulk,
                    )
                    candidate_school_id = school_id
            except HTTPException as exc:
                detail = (
                    exc.detail
                    if isinstance(exc.detail, str)
                    else "Invalid registration_type for this exam."
                )
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message=detail,
                        field="registration_type",
                    )
                )
                failed += 1
                continue

            if not programme_code:
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message="Add a programme_code for this row.",
                        field="programme_code",
                    )
                )
                failed += 1
                continue

            programme = await get_programme(programme_code)
            if not programme:
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message=f'Programme code "{programme_code}" was not found.',
                        field="programme_code",
                    )
                )
                failed += 1
                continue

            if not await programme_available(programme.id):
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message=(
                            f'Programme "{programme_code}" is not available for your school.'
                        ),
                        field="programme_code",
                    )
                )
                failed += 1
                continue

            programme_id = programme.id
            selected_subject_ids: list[int] = []
            is_private_bulk = candidate_registration_type == RegistrationType.PRIVATE.value
            is_structured_bulk = candidate_registration_type in (
                RegistrationType.FREE_TVET.value,
                RegistrationType.REGULAR.value,
            )
            use_subject_codes_path = (
                is_private_bulk
                or is_private_exam(exam)
                or candidate_registration_type == RegistrationType.REFERRAL.value
            )

            row_subject_error = False
            if use_subject_codes_path:
                subject_codes_str = _str_or_none(
                    _cell(row, "subject_codes", "subject codes")
                )
                if not subject_codes_str:
                    errors.append(
                        BulkUploadError(
                            row_number=row_number,
                            error_message="Add subject_codes as a comma-separated list.",
                            field="subject_codes",
                        )
                    )
                    failed += 1
                    continue

                subject_code_list = [
                    code.strip()
                    for code in subject_codes_str.split(",")
                    if code.strip()
                ]
                for subject_code in subject_code_list:
                    subject = await get_subject_by_original_or_code(subject_code)
                    if not subject:
                        errors.append(
                            BulkUploadError(
                                row_number=row_number,
                                error_message=(
                                    f'Subject code "{subject_code}" was not found.'
                                ),
                                field="subject_codes",
                            )
                        )
                        row_subject_error = True
                        break
                    if subject.id not in selected_subject_ids:
                        selected_subject_ids.append(subject.id)

                if row_subject_error:
                    failed += 1
                    continue

                for code in optional_subject_codes:
                    subject = await get_subject_by_code(code.strip())
                    if subject and subject.id not in selected_subject_ids:
                        selected_subject_ids.append(subject.id)
            else:
                subjects_info = await get_subjects_info(programme_id)
                if is_structured_bulk:
                    selected_subject_ids.extend(subjects_info["compulsory_core"])
                    selected_subject_ids.extend(subjects_info["electives"])

                option_value = _str_or_none(_cell(row, "option")) or ""
                if not option_value:
                    errors.append(
                        BulkUploadError(
                            row_number=row_number,
                            error_message="Add option: use SOC or ENT.",
                            field="option",
                        )
                    )
                    failed += 1
                    continue

                if option_match_tokens(option_value) is None:
                    errors.append(
                        BulkUploadError(
                            row_number=row_number,
                            error_message=(
                                "option must be SOC or ENT (or C702 / C705). "
                                f'You entered "{option_value}".'
                            ),
                            field="option",
                        )
                    )
                    failed += 1
                    continue

                option_subject = await resolve_option_subject(
                    programme_id, option_value
                )
                if not option_subject:
                    errors.append(
                        BulkUploadError(
                            row_number=row_number,
                            error_message=(
                                f'option "{option_value}" could not be matched on this '
                                "programme. Link Social Studies (C702 / SOC) or "
                                "Entrepreneurship (C705 / ENT) as an optional-core subject."
                            ),
                            field="option",
                        )
                    )
                    failed += 1
                    continue

                if option_subject.id not in selected_subject_ids:
                    selected_subject_ids.append(option_subject.id)

            selected_subject_ids = list(set(selected_subject_ids))

            is_valid, validation_errors = await validate_subject_selections(
                session,
                programme_id,
                selected_subject_ids,
                registration_type=candidate_registration_type,
            )
            if not is_valid:
                errors.append(
                    BulkUploadError(
                        row_number=row_number,
                        error_message=(
                            f"Subject choice issue: {'; '.join(validation_errors)}"
                        ),
                        field="subjects",
                    )
                )
                failed += 1
                continue

            if dry_run:
                successful += 1
                continue

            registration_number = await generate_unique_registration_number(
                session, exam_id, candidate_school_id, candidate_registration_type
            )

            new_candidate = RegistrationCandidate(
                registration_exam_id=exam_id,
                school_id=candidate_school_id,
                portal_user_id=current_user.id,
                firstname=firstname_str,
                lastname=lastname_str,
                othername=othername,
                registration_number=registration_number,
                date_of_birth=date_of_birth,
                gender=gender,
                programme_code=programme_code,
                programme_id=programme_id,
                contact_email=contact_email,
                contact_phone=contact_phone,
                address=address,
                national_id=national_id,
                disability=disability,
                registration_type=candidate_registration_type,
                guardian_name=guardian_name,
                guardian_phone=guardian_phone,
                guardian_digital_address=guardian_digital_address,
                guardian_national_id=guardian_national_id,
                registration_status=RegistrationStatus.INCOMPLETE,
                fee_payment_status=default_fee_payment_status(
                    candidate_registration_type
                ),
            )
            session.add(new_candidate)
            await session.flush()

            for subject_id in selected_subject_ids:
                subject = subject_by_id.get(subject_id)
                if not subject:
                    result = await session.execute(
                        select(Subject).where(Subject.id == subject_id)
                    )
                    subject = result.scalar_one_or_none()
                    if subject:
                        subject_by_id[subject.id] = subject
                        subject_by_code[subject.code] = subject
                if not subject:
                    continue
                session.add(
                    RegistrationSubjectSelection(
                        registration_candidate_id=new_candidate.id,
                        subject_id=subject.id,
                        subject_code=subject.code,
                        subject_name=subject.name,
                    )
                )

            successful += 1

        except Exception:
            errors.append(
                BulkUploadError(
                    row_number=row_number,
                    error_message=(
                        "Could not process this row. Check the values and try again."
                    ),
                    field=None,
                )
            )
            failed += 1
            continue

    if dry_run:
        await session.rollback()
    elif commit:
        try:
            await session.commit()
        except Exception as e:
            await session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Error committing candidates: {str(e)}",
            ) from e

    return BulkUploadResponse(
        total_rows=len(rows),
        successful=successful,
        failed=failed,
        errors=errors,
    )
