"""Bank-specific account number normalization for exam centre officials.

All banks persist exactly 13 digits in ``account_number``.

Detection uses ``bank_name`` from the selected ``BankBranch`` (case-insensitive substring):

- **ABSA** — e.g. directory name ``ABSA (GH) LTD`` (matched via ``absa``): user enters 7 digits;
  prepend 6-digit branch ``bank_code``.
- **ADB** — directory name ``AGRICULTURAL DEVELOPMENT BANK``: user enters 16 digits on create;
  drop first 3. On update, 13 digits (already normalized) or 16 (re-trim) are accepted.
- **Standard** — all other banks: user enters 13 digits unchanged.

Precedence: ABSA before ADB before standard.
"""

from enum import Enum

ABSA_ACCOUNT_INPUT_LEN = 7
ADB_ACCOUNT_INPUT_LEN = 16
ADB_TRIM_PREFIX_LEN = 3
FULL_ACCOUNT_LEN = 13
BRANCH_CODE_LEN = 6

# Canonical bank_name values from the bank directory (bulk upload).
ABSA_BANK_NAME_IN_DIRECTORY = "ABSA (GH) LTD"
ADB_BANK_NAME_IN_DIRECTORY = "AGRICULTURAL DEVELOPMENT BANK"

ABSA_BANK_NAME_MARKER = "absa"
ADB_BANK_NAME_MARKER = "agricultural development bank"


class AccountBankKind(str, Enum):
    STANDARD = "standard"
    ABSA = "absa"
    ADB = "adb"


def resolve_bank_kind(bank_name: str) -> AccountBankKind:
    name = bank_name.strip().casefold()
    if ABSA_BANK_NAME_MARKER in name:
        return AccountBankKind.ABSA
    if ADB_BANK_NAME_MARKER in name:
        return AccountBankKind.ADB
    return AccountBankKind.STANDARD


def is_absa_bank_name(bank_name: str) -> bool:
    return resolve_bank_kind(bank_name) == AccountBankKind.ABSA


def is_adb_bank_name(bank_name: str) -> bool:
    return resolve_bank_kind(bank_name) == AccountBankKind.ADB


def _digits_only(value: str) -> str:
    return "".join(c for c in value.strip() if c.isdigit())


def normalize_branch_code(bank_code: str) -> str:
    """Six-digit branch / sort code for ABSA prepend (left-zero-pads when shorter)."""
    digits = _digits_only(bank_code)
    if not digits:
        raise ValueError("Invalid branch code for ABSA; bank directory entry is missing a code")
    if len(digits) > BRANCH_CODE_LEN:
        raise ValueError("Invalid branch code for ABSA; expected at most 6 digits")
    return digits.zfill(BRANCH_CODE_LEN)


def account_input_length_for_bank(bank_name: str) -> int:
    kind = resolve_bank_kind(bank_name)
    if kind == AccountBankKind.ABSA:
        return ABSA_ACCOUNT_INPUT_LEN
    if kind == AccountBankKind.ADB:
        return ADB_ACCOUNT_INPUT_LEN
    return FULL_ACCOUNT_LEN


def split_absa_account_for_display(stored_13: str, bank_code: str) -> str:
    """Return 7-digit suffix for edit form when stored value starts with branch code."""
    stored = _digits_only(stored_13)
    if len(stored) != FULL_ACCOUNT_LEN:
        return stored
    try:
        prefix = normalize_branch_code(bank_code)
    except ValueError:
        return stored
    if stored.startswith(prefix):
        return stored[len(prefix) :]
    return stored


def normalize_account_for_save(
    account_number: str,
    *,
    bank_name: str,
    bank_code: str,
    for_update: bool = False,
) -> str:
    """Validate user input and return the 13-digit value to store."""
    account = _digits_only(account_number)
    if not account:
        raise ValueError("account_number is required")

    kind = resolve_bank_kind(bank_name)
    if kind == AccountBankKind.ABSA:
        if len(account) != ABSA_ACCOUNT_INPUT_LEN:
            raise ValueError(
                "ABSA account must be exactly 7 digits (6-digit branch code is added automatically)"
            )
        branch = normalize_branch_code(bank_code)
        stored = branch + account
        if len(stored) != FULL_ACCOUNT_LEN:
            raise ValueError("Invalid branch code for ABSA; contact support to fix the bank directory")
        return stored

    if kind == AccountBankKind.ADB:
        if len(account) == ADB_ACCOUNT_INPUT_LEN:
            return account[ADB_TRIM_PREFIX_LEN:]
        if len(account) == FULL_ACCOUNT_LEN:
            if for_update:
                return account
            raise ValueError("ADB account must be exactly 16 digits")
        if for_update:
            raise ValueError(
                "ADB account must be 16 digits, or 13 digits when keeping the saved account number"
            )
        raise ValueError("ADB account must be exactly 16 digits")

    if len(account) != FULL_ACCOUNT_LEN:
        raise ValueError("Account number must be exactly 13 digits")
    return account
