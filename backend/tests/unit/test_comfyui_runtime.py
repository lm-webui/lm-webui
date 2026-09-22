"""The managed ComfyUI engine, and the failure modes that made generation unusable.

Mirrors the llama.cpp runtime's shape (app/runtime/vision_runtime.py). These stub the
process rather than spawning ComfyUI — no engine, no torch, no GPU needed.
"""
import asyncio
from pathlib import Path

import pytest

from app.services import comfyui_runtime as cr


@pytest.fixture
def engine(tmp_path, monkeypatch):
    """Point the runtime at a throwaway engine directory."""
    monkeypatch.setenv("COMFYUI_DIR", str(tmp_path / "comfyui"))
    monkeypatch.setenv("COMFYUI_PORT", "8188")
    return tmp_path / "comfyui"


def _fake_main(engine: Path) -> Path:
    engine.mkdir(parents=True, exist_ok=True)
    (engine / "main.py").write_text("# comfyui")
    py = cr.venv_python()
    py.parent.mkdir(parents=True, exist_ok=True)
    py.write_text("#!/bin/sh\n")
    return py


# ── Locations ─────────────────────────────────────────────────────────────

def test_engine_lives_under_the_app_root_by_default(monkeypatch):
    """Never the user's home — ~/ComfyUI was the legacy location and is not written to."""
    monkeypatch.delenv("COMFYUI_DIR", raising=False)
    engine = cr.engine_dir()
    assert engine.name == "comfyui"
    assert "ComfyUI" not in engine.parts[-2:]  # case-sensitive: not the bare ~/ComfyUI
    assert cr.checkpoints_dir() == engine / "models" / "checkpoints"


def test_env_overrides_the_engine_dir(engine):
    assert cr.engine_dir() == engine


# ── State ─────────────────────────────────────────────────────────────────

def test_not_installed_when_main_py_is_absent(engine):
    assert cr.comfyui_runtime.installed is False


def test_installed_is_independent_of_running(engine):
    """A stopped-but-installed engine must be distinguishable from a missing one — the old
    HTTP-probe detection conflated them."""
    _fake_main(engine)
    assert cr.comfyui_runtime.installed is True
    assert cr.comfyui_runtime.running is False


def test_running_follows_the_process(engine):
    _fake_main(engine)
    runtime = cr.ComfyUIRuntime()

    class _Alive:
        def poll(self):
            return None

    class _Dead:
        def poll(self):
            return 1

    runtime._process = _Alive()
    assert runtime.running is True
    runtime._process = _Dead()
    assert runtime.running is False


def test_checkpoints_lists_only_model_files(engine):
    directory = cr.checkpoints_dir()
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "sd_xl_base_1.0.safetensors").write_text("x")
    (directory / "old.ckpt").write_text("x")
    (directory / "notes.txt").write_text("x")

    assert cr.comfyui_runtime.checkpoints() == ["old.ckpt", "sd_xl_base_1.0.safetensors"]


# ── Start ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_start_refuses_without_an_install(engine):
    runtime = cr.ComfyUIRuntime()
    assert await runtime.start() is False
    assert "not installed" in runtime.last_error.lower()


@pytest.mark.asyncio
async def test_start_refuses_without_a_venv(engine):
    """Cloned but never finished installing — say so instead of failing obscurely."""
    engine.mkdir(parents=True, exist_ok=True)
    (engine / "main.py").write_text("# comfyui")

    runtime = cr.ComfyUIRuntime()
    assert await runtime.start() is False
    assert "virtualenv" in runtime.last_error.lower()


@pytest.mark.asyncio
async def test_start_argv_binds_loopback_only(engine, monkeypatch):
    """ComfyUI has no authentication, and /prompt executes workflows — binding 0.0.0.0
    would expose that to the whole LAN. This is a security property, not a preference."""
    _fake_main(engine)
    captured = {}

    class _Proc:
        def __init__(self, argv, **kwargs):
            captured["argv"] = argv
            captured["cwd"] = kwargs.get("cwd")

        def poll(self):
            return None

    monkeypatch.setattr(cr.subprocess, "Popen", _Proc)

    runtime = cr.ComfyUIRuntime()

    async def _healthy():
        return True

    monkeypatch.setattr(runtime, "_healthy", _healthy)

    assert await runtime.start() is True
    argv = captured["argv"]
    assert "0.0.0.0" not in argv
    assert argv[argv.index("--listen") + 1] == "127.0.0.1"
    assert "--disable-auto-launch" in argv
    assert captured["cwd"] == str(engine)
    # Runs under its own venv interpreter, never the backend's.
    assert argv[0] == str(cr.venv_python())


@pytest.mark.asyncio
async def test_start_reports_early_exit_from_the_log(engine, monkeypatch):
    """A crash on startup must surface the log tail, not a bare timeout."""
    _fake_main(engine)
    log = cr.log_path()
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text("ModuleNotFoundError: No module named 'torch'\n")

    class _Dead:
        def __init__(self, *a, **k):
            pass

        def poll(self):
            return 1

    monkeypatch.setattr(cr.subprocess, "Popen", _Dead)
    runtime = cr.ComfyUIRuntime()
    assert await runtime.start() is False
    assert "torch" in runtime.last_error


# ── Model catalog ─────────────────────────────────────────────────────────

def test_catalog_filenames_match_what_the_downloader_installs():
    """The whole failure was a graph asking for one filename while the downloader produced
    another. Both read this catalogue now, so they cannot drift apart again."""
    from app.routes.comfyui import MODEL_CATALOG as route_catalog
    assert route_catalog is cr.MODEL_CATALOG

    for key, entry in cr.MODEL_CATALOG.items():
        assert entry["filename"].endswith((".safetensors", ".ckpt"))
        assert entry["url"].endswith(entry["filename"])
        assert cr.checkpoint_for(key) == entry["filename"]


def test_checkpoint_for_is_case_insensitive_and_rejects_unknown():
    assert cr.checkpoint_for("SDXL") == "sd_xl_base_1.0.safetensors"
    assert cr.checkpoint_for("flux-dev") is None
    assert cr.checkpoint_for("") is None


# ── Generation-path helpers ───────────────────────────────────────────────

def test_history_error_extracts_the_failure():
    """A failed run has no outputs; polling only for outputs reported it as a timeout."""
    from app.services.local_image import _history_error

    entry = {"status": {"status_str": "error", "messages": [
        ["execution_start", {}],
        ["execution_error", {"node_type": "CheckpointLoaderSimple",
                             "exception_message": "value not in list"}],
    ]}}
    msg = _history_error(entry)
    assert msg and "value not in list" in msg and "CheckpointLoaderSimple" in msg


def test_history_error_is_none_for_success_and_pending():
    from app.services.local_image import _history_error

    assert _history_error({"status": {"status_str": "success"}}) is None
    assert _history_error({}) is None
    assert _history_error({"status": {"status_str": "error"}}) is not None


def test_node_errors_names_the_offending_node():
    from app.services.local_image import _node_errors

    body = {"node_errors": {"4": {"errors": [{
        "type": "value_not_in_list",
        "message": "Value not in list",
        "extra_info": {"received_value": "sdxl.safetensors"},
    }]}}}
    out = _node_errors(body)
    assert "node 4" in out and "sdxl.safetensors" in out


class _FakeResp:
    def __init__(self, payload, status=200):
        self._payload = payload
        self.status = status

    async def json(self, content_type=None):
        return self._payload

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class _FakeSession:
    """Serves a canned /models/checkpoints list."""

    def __init__(self, checkpoints=None, status=200):
        self._checkpoints = checkpoints or []
        self._status = status

    def get(self, url):
        return _FakeResp(self._checkpoints, self._status)


@pytest.mark.asyncio
async def test_resolve_checkpoint_matches_the_installed_file(engine):
    from app.services.local_image import _resolve_checkpoint

    session = _FakeSession(["sd_xl_base_1.0.safetensors"])
    name, err = await _resolve_checkpoint(session, "sdxl")
    assert name == "sd_xl_base_1.0.safetensors" and err is None


@pytest.mark.asyncio
async def test_resolve_checkpoint_reports_the_missing_file(engine):
    """The negative case that matters: a model with no checkpoint must fail *before*
    reaching /prompt, naming the file, instead of hanging 120s on a ComfyUI timeout."""
    from app.services.local_image import _resolve_checkpoint

    session = _FakeSession(["something_else.safetensors"])
    name, err = await _resolve_checkpoint(session, "sdxl")
    assert name is None
    assert "sd_xl_base_1.0.safetensors" in err
    assert "something_else.safetensors" in err


@pytest.mark.asyncio
async def test_resolve_checkpoint_rejects_an_unknown_model(engine):
    from app.services.local_image import _resolve_checkpoint

    name, err = await _resolve_checkpoint(_FakeSession([]), "flux-dev")
    assert name is None
    assert "Unknown image model" in err


@pytest.mark.asyncio
async def test_resolve_checkpoint_falls_back_to_disk_when_server_is_down(engine):
    """While ComfyUI is stopped there is no /models/checkpoints to ask, but the managed
    directory is ours to read — so the error can still name the real file."""
    from app.services.local_image import _resolve_checkpoint

    directory = cr.checkpoints_dir()
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "sd_xl_base_1.0.safetensors").write_text("x")

    name, err = await _resolve_checkpoint(_FakeSession([], status=503), "sdxl")
    assert name == "sd_xl_base_1.0.safetensors" and err is None
