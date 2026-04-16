"""Helpers for school `code` and derived numeric `s_code`."""


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
