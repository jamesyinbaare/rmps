"""Attendance sheet storage: human-readable paths vs legacy UUID under exam documents."""

import pytest

from app.services import attendance_sheet_files as asf
from app.services.attendance_sheet_files import AttendanceSheetUploadError
from app.services.exam_documents import is_uuid_stored_object_key


def test_is_uuid_stored_object_key() -> None:
    assert is_uuid_stored_object_key("a1b2c3d4e5f6789012345678abcdef01.pdf")
    assert not is_uuid_stored_object_key("exam-tools/attendance-sheets/1/sheet.pdf")
    assert not is_uuid_stored_object_key("not-a-uuid.pdf")


def test_read_legacy_delegates_to_exam_documents(monkeypatch: pytest.MonkeyPatch) -> None:
    called: list[str] = []

    def fake_read(p: str) -> bytes:
        called.append(p)
        return b"legacy"

    monkeypatch.setattr("app.services.attendance_sheet_files.read_stored_bytes", fake_read)
    legacy = "a1b2c3d4e5f6789012345678abcdef01.pdf"
    assert asf.read_attendance_sheet_bytes(legacy) == b"legacy"
    assert called == [legacy]


def test_local_write_read_remove_roundtrip(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr("app.config.settings.storage_backend", "local")
    monkeypatch.setattr("app.config.settings.storage_path", str(tmp_path / "documents"))

    display = "ACC-01 Wesley Gir 2026-05-19.pdf"
    key = asf.write_attendance_sheet_file(b"hello", 7, display)
    assert key == "attendance-sheets/7/ACC-01 Wesley Gir 2026-05-19.pdf"
    path = tmp_path / "attendance-sheets" / "7" / "ACC-01 Wesley Gir 2026-05-19.pdf"
    assert path.is_file()
    assert path.read_bytes() == b"hello"
    assert asf.read_attendance_sheet_bytes(key) == b"hello"
    asf.remove_attendance_sheet_file(key)
    assert not path.is_file()


def test_local_rejects_path_traversal(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr("app.config.settings.storage_backend", "local")
    monkeypatch.setattr("app.config.settings.storage_path", str(tmp_path / "documents"))

    with pytest.raises(AttendanceSheetUploadError, match="Invalid stored path"):
        asf.read_attendance_sheet_bytes("attendance-sheets/9/../../secrets")

    with pytest.raises(AttendanceSheetUploadError, match="Invalid stored path"):
        asf.read_attendance_sheet_bytes("attendance-sheets/../../../etc/passwd")


def test_local_rejects_escape_outside_attendance_root(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setattr("app.config.settings.storage_backend", "local")
    monkeypatch.setattr("app.config.settings.storage_path", str(tmp_path / "documents"))
    (tmp_path / "documents").mkdir(parents=True)
    evil = (tmp_path / "evil.txt")
    evil.write_text("x")
    rel = f"attendance-sheets/../documents/evil.txt"
    with pytest.raises(AttendanceSheetUploadError, match="Invalid stored path"):
        asf.read_attendance_sheet_bytes(rel)


def test_write_gcs_uses_attendance_prefix_and_full_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.config.settings.storage_backend", "gcs")
    monkeypatch.setattr(
        "app.config.settings.gcs_attendance_sheets_prefix",
        "exam-tools/attendance-sheets",
    )
    uploads: list[tuple[str, bytes, str | None]] = []

    class FakeBlob:
        def __init__(self, name: str) -> None:
            self._name = name

        def upload_from_string(self, content: bytes, content_type: str | None = None) -> None:
            uploads.append((self._name, content, content_type))

    class FakeBucket:
        def blob(self, name: str) -> FakeBlob:
            return FakeBlob(name)

    monkeypatch.setattr("app.services.attendance_sheet_files._get_gcs_bucket", lambda: FakeBucket())

    key = asf.write_attendance_sheet_file(b"data", 42, "Acc 2026-01-01.pdf")
    expected = "exam-tools/attendance-sheets/42/Acc 2026-01-01.pdf"
    assert key == expected
    assert len(uploads) == 1
    assert uploads[0][0] == expected
    assert uploads[0][1] == b"data"
