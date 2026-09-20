"""Path traversal and SSRF guards on client-supplied input.

Each of these was a real hole: an unauthenticated caller could name a file for
`/api/download/file` and write anywhere the service user could reach, and a logged-in user
could traverse out of the upload/model dirs into the venv. The helpers tested here are the
single chokepoint those paths were all routed through.
"""
import os

import pytest

from app.core.error_handlers import safe_path, ValidationException


# ── safe_path ─────────────────────────────────────────────────────────────

@pytest.mark.parametrize("candidate", [
    "../escape.txt",
    "../../escape.txt",
    "../../../../etc/passwd",
    "sub/../../escape.txt",
    "/etc/passwd",
    "..",
])
def test_safe_path_rejects_escapes(tmp_path, candidate):
    with pytest.raises(ValidationException):
        safe_path(tmp_path, candidate)


@pytest.mark.parametrize("candidate", [
    "a.txt",
    "nested/a.txt",
    "sub/../a.txt",       # resolves inside the base, so it is legitimate
])
def test_safe_path_allows_contained_paths(tmp_path, candidate):
    result = safe_path(tmp_path, candidate)
    assert result.resolve().is_relative_to(tmp_path.resolve())


def test_safe_path_rejects_symlink_escape(tmp_path):
    """A symlink inside the base that points outside it must not be followed out."""
    outside = tmp_path / "outside"
    outside.mkdir()
    (outside / "secret.txt").write_text("secret")

    base = tmp_path / "base"
    base.mkdir()
    link = base / "link"
    try:
        os.symlink(outside, link)
    except OSError:
        pytest.skip("symlinks unavailable on this platform")

    with pytest.raises(ValidationException):
        safe_path(base, "link/secret.txt")


# ── upload destination naming ─────────────────────────────────────────────

def test_unique_dest_rejects_traversal(tmp_path):
    from app.routes.upload import _unique_dest

    with pytest.raises(ValidationException):
        _unique_dest(tmp_path, "../../../tmp/evil.txt")


def test_unique_dest_dedupes_without_escaping(tmp_path):
    from app.routes.upload import _unique_dest

    (tmp_path / "a.txt").write_text("x")
    result = _unique_dest(tmp_path, "a.txt")

    assert result.name == "a-1.txt"
    assert result.parent.resolve() == tmp_path.resolve()


# ── upload size cap ───────────────────────────────────────────────────────

class _FakeUpload:
    """Minimal UploadFile stand-in — `save_upload` only needs `read`."""

    def __init__(self, payload: bytes):
        self._payload = payload
        self._pos = 0

    async def read(self, size: int = -1) -> bytes:
        if size is None or size < 0:
            chunk, self._pos = self._payload[self._pos:], len(self._payload)
            return chunk
        chunk = self._payload[self._pos:self._pos + size]
        self._pos += len(chunk)
        return chunk


@pytest.mark.asyncio
async def test_save_upload_enforces_size_cap(tmp_path):
    from app.routes.upload import save_upload

    dest = tmp_path / "big.bin"
    with pytest.raises(ValidationException):
        await save_upload(_FakeUpload(b"x" * 5000), dest, max_bytes=1024)

    # The partial file must not be left behind for a later reader to mistake for complete.
    assert not dest.exists()


@pytest.mark.asyncio
async def test_save_upload_writes_under_the_cap(tmp_path):
    from app.routes.upload import save_upload

    dest = tmp_path / "ok.bin"
    written = await save_upload(_FakeUpload(b"x" * 100), dest, max_bytes=1024)

    assert written == 100
    assert dest.read_bytes() == b"x" * 100


def test_upload_size_caps_come_from_config():
    from app.routes.upload import _max_bytes

    assert _max_bytes("general") == 100 * 1024 * 1024
    assert _max_bytes("image_generation") == 20 * 1024 * 1024


# ── download SSRF guard ───────────────────────────────────────────────────

@pytest.mark.parametrize("url", [
    "http://169.254.169.254/latest/meta-data/",   # cloud metadata
    "http://127.0.0.1:7070/api/system/info",
    "http://10.0.0.5/",
    "http://localhost/",
    "http://metadata.google.internal/",
    "http://0.0.0.0/",
])
def test_download_rejects_internal_urls(url):
    from fastapi import HTTPException

    from app.routes.download import _validate_url

    with pytest.raises(HTTPException):
        _validate_url(url)


@pytest.mark.parametrize("url", ["file:///etc/passwd", "ftp://example.com/x", "gopher://x/"])
def test_download_rejects_non_http_schemes(url):
    from fastapi import HTTPException

    from app.routes.download import _validate_url

    with pytest.raises(HTTPException):
        _validate_url(url)


def test_download_allows_public_url():
    from app.routes.download import _validate_url

    _validate_url("https://example.com/model.gguf")  # must not raise


def test_gguf_downloader_rejects_internal_urls():
    """The GGUF path has its own guard (allowlist + DNS), which must also reject these."""
    from app.services.gguf_downloader import gguf_downloader

    for url in ("http://169.254.169.254/", "http://127.0.0.1/", "file:///etc/passwd"):
        assert gguf_downloader._validate_url(url) is False, url


# ── vision file reference containment ─────────────────────────────────────

def test_vision_refuses_files_outside_the_media_dir(tmp_path):
    """A ref carries a client-supplied path; only media-dir files may be read."""
    from app.capabilities.vision import collect_image_data_uris

    secret = tmp_path / "id_rsa"
    secret.write_text("PRIVATE KEY")

    assert collect_image_data_uris([
        {"type": "image", "mime": "image/png", "file_path": str(secret)}
    ]) == []

    assert collect_image_data_uris([
        {"type": "image", "mime": "image/png", "file_path": "/etc/passwd"}
    ]) == []
