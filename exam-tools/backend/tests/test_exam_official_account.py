import pytest

from app.services.exam_official_account import (
    ADB_BANK_NAME_IN_DIRECTORY,
    ABSA_BANK_NAME_IN_DIRECTORY,
    FULL_ACCOUNT_LEN,
    AccountBankKind,
    normalize_account_for_save,
    normalize_branch_code,
    resolve_bank_kind,
    split_absa_account_for_display,
)


def test_resolve_bank_kind() -> None:
    assert resolve_bank_kind(ABSA_BANK_NAME_IN_DIRECTORY) == AccountBankKind.ABSA
    assert resolve_bank_kind(ADB_BANK_NAME_IN_DIRECTORY) == AccountBankKind.ADB
    assert resolve_bank_kind("GCB Bank") == AccountBankKind.STANDARD


def test_normalize_branch_code_zfill() -> None:
    assert normalize_branch_code("30100") == "030100"
    assert normalize_branch_code("030100") == "030100"


def test_absa_prepend() -> None:
    stored = normalize_account_for_save(
        "1234567",
        bank_name=ABSA_BANK_NAME_IN_DIRECTORY,
        bank_code="030100",
    )
    assert stored == "0301001234567"
    assert len(stored) == FULL_ACCOUNT_LEN


def test_absa_rejects_wrong_lengths() -> None:
    with pytest.raises(ValueError, match="7 digits"):
        normalize_account_for_save("123456", bank_name=ABSA_BANK_NAME_IN_DIRECTORY, bank_code="030100")
    with pytest.raises(ValueError, match="7 digits"):
        normalize_account_for_save("12345678", bank_name=ABSA_BANK_NAME_IN_DIRECTORY, bank_code="030100")
    with pytest.raises(ValueError, match="7 digits"):
        normalize_account_for_save("0301001234567", bank_name=ABSA_BANK_NAME_IN_DIRECTORY, bank_code="030100")


def test_adb_trim_on_create() -> None:
    stored = normalize_account_for_save(
        "1234567890123456",
        bank_name=ADB_BANK_NAME_IN_DIRECTORY,
        bank_code="000001",
    )
    assert stored == "4567890123456"
    assert len(stored) == FULL_ACCOUNT_LEN


def test_adb_rejects_13_on_create() -> None:
    with pytest.raises(ValueError, match="16 digits"):
        normalize_account_for_save(
            "4567890123456",
            bank_name=ADB_BANK_NAME_IN_DIRECTORY,
            bank_code="000001",
        )


def test_adb_accepts_13_on_update() -> None:
    stored = normalize_account_for_save(
        "4567890123456",
        bank_name=ADB_BANK_NAME_IN_DIRECTORY,
        bank_code="000001",
        for_update=True,
    )
    assert stored == "4567890123456"


def test_adb_rejects_bad_lengths() -> None:
    with pytest.raises(ValueError, match="16 digits"):
        normalize_account_for_save(
            "123456789012345",
            bank_name=ADB_BANK_NAME_IN_DIRECTORY,
            bank_code="000001",
        )


def test_standard_13() -> None:
    acct = "0123456789012"
    assert (
        normalize_account_for_save(acct, bank_name="Ghana Commercial Bank", bank_code="40101") == acct
    )


def test_standard_rejects_16() -> None:
    with pytest.raises(ValueError, match="13 digits"):
        normalize_account_for_save(
            "1234567890123456",
            bank_name="Ghana Commercial Bank",
            bank_code="40101",
        )


def test_split_absa_account_for_display() -> None:
    assert split_absa_account_for_display("0301001234567", "030100") == "1234567"
    assert split_absa_account_for_display("0301001234567", "30100") == "1234567"
    assert split_absa_account_for_display("9999991234567", "030100") == "9999991234567"


def test_absa_precedence_over_adb_name_collision() -> None:
    name = "ABSA something agricultural development bank"
    assert resolve_bank_kind(name) == AccountBankKind.ABSA
