"""Helpers for school `code` and derived numeric `s_code`."""


def _digits_to_letter(digits: str) -> str | None:
    """Map 1-based digit group to A–Z. Returns None if not in 1–26."""
    if not digits.isdigit():
        return None
    n = int(digits)
    if n < 1 or n > 26:
        return None
    return chr(ord("A") + n - 1)


def sheet_prefix_to_school_code(prefix: str) -> str:
    """
    Map the 6-character sheet-ID school segment to School.code.

    - Normal 6-character codes (e.g. 817090): unchanged.
    - Prefix starts with 1: last digit → letter (1→A … 9→I), prepend 8.
      Example: 170901 → 817090A
    - Prefix starts with 7: last two digits → letter (10→J … 26→Z), prepend 81.
      Example: 709011 → 817090K
    - If the mapped number is not in 1–26, return the 6-character prefix unchanged.
    """
    p = prefix.strip()[:6]
    if len(p) != 6:
        return p

    if p.startswith("1"):
        letter = _digits_to_letter(p[-1])
        if letter is not None:
            return "8" + p[:5] + letter
    elif p.startswith("7"):
        letter = _digits_to_letter(p[-2:])
        if letter is not None:
            return "81" + p[:4] + letter
    return p


def derive_s_code(code: str) -> str:
    """
    Return the numeric form of a school code.

    If the last character is an ASCII letter (A–Z, any case), replace it with
    its 1-based index (A→1, …, Z→26). Otherwise return the trimmed code unchanged.
    """
    c = code.strip()
    if len(c) >= 1:
        last = c[-1]
        if last.isascii() and last.isalpha():
            return c[:-1] + str(ord(last.upper()) - ord("A") + 1)
    return c


def sheet_id_school_prefix(s_code: str) -> str:
    """
    Match `generate_sheet_id` school segment: last 6 chars, uppercased, left-padded to 6 with zeros.
    """
    school_code_padded = s_code[-6:].upper().rjust(6, "0")
    return school_code_padded
