"""
Local Image Generation — ComfyUI client for SD/Flux/LTX.
"""
import logging
import asyncio
import aiohttp
import os
import random
from typing import Optional
from fastapi.responses import JSONResponse
from app.models.schemas import ChatRequest
from app.services.save_generated_image import save_generated_image

logger = logging.getLogger(__name__)

def _env_external() -> str:
    """`COMFYUI_URL` — an operator-set endpoint (Docker/host setups). Always wins."""
    return os.getenv("COMFYUI_URL", "").strip().rstrip("/")


def _registered_external() -> str:
    """An endpoint the user registered from Runtime Manager, or "".

    The registration used to be stored but never consulted, so pointing the app at your own
    ComfyUI did nothing.
    """
    try:
        from app.runtime.registry import get_runtime_registry
        entry = get_runtime_registry().get_runtime("comfyui") or {}
        if entry.get("source") == "external":
            return (entry.get("endpoint") or "").strip().rstrip("/")
    except Exception:
        pass
    return ""


def _base_url() -> str:
    """Where to reach ComfyUI.

    Precedence: COMFYUI_URL, then the managed engine when it is installed, then a registered
    external endpoint.

    The managed engine outranking a registration matters: a registration is persistent
    state, so a stale one (a laptop that moved networks, a container that is no longer up)
    would otherwise silently hijack every generation once the endpoint became reachable-in-
    principle. The registration is a fallback for people who have no managed engine, which
    is exactly the "I already run ComfyUI elsewhere" case.
    """
    env = _env_external()
    if env:
        return env
    from app.services.comfyui_runtime import comfyui_runtime
    if comfyui_runtime.installed or comfyui_runtime.running:
        return comfyui_runtime.base_url
    return _registered_external() or comfyui_runtime.base_url


def _is_external() -> bool:
    """True when generation is aimed at a server we do not manage (so we must not try to
    start a local process or read our own disk to decide what is installed)."""
    if _env_external():
        return True
    from app.services.comfyui_runtime import comfyui_runtime
    return not comfyui_runtime.installed and bool(_registered_external())


async def _installed_checkpoints(session) -> list:
    """Checkpoint filenames ComfyUI reports, from ComfyUI itself.

    `GET /models/checkpoints` is authoritative and works for both the managed engine and an
    external one. Falls back to the managed directory on disk when the server is unreachable,
    so a clear "not downloaded" error can still be produced while stopped.
    """
    try:
        async with session.get(f"{_base_url()}/models/checkpoints") as r:
            if r.status == 200:
                return list(await r.json())
    except Exception:
        pass
    from app.services.comfyui_runtime import comfyui_runtime
    return comfyui_runtime.checkpoints()


async def _resolve_checkpoint(session, model: str) -> tuple:
    """Map a model key to a checkpoint ComfyUI actually has.

    Returns (filename, None) on success or (None, error_message) — the message names the
    missing file and what is available, because the old code let ComfyUI reject the graph
    with an opaque validation error instead.
    """
    from app.services.comfyui_runtime import MODEL_CATALOG

    key = (model or "").strip().lower()
    installed = await _installed_checkpoints(session)
    entry = MODEL_CATALOG.get(key)
    if not entry:
        # ComfyUI discovers checkpoint files by filename. Accepting an exact installed
        # filename lets local uploads and user-managed downloads work without source changes.
        if model and model == os.path.basename(model) and model in installed:
            return model, None
        known = ", ".join(sorted(set(MODEL_CATALOG) | set(installed)))
        return None, f"Unknown image model '{model}'. Available: {known}."

    wanted = entry["filename"]
    if wanted in installed:
        return wanted, None

    if installed:
        return None, (
            f"Model '{key}' needs '{wanted}', which isn't installed. "
            f"Installed: {', '.join(installed)}."
        )
    return None, (
        f"Model '{key}' needs '{wanted}' and no checkpoints are installed. "
        f"Download it from Runtime Manager → Image-Gen."
    )


async def generate_image_local(req: ChatRequest, background_tasks=None):
    user_id = req.user_id
    if not user_id:
        return JSONResponse(status_code=400, content={"error": "User ID required"})

    provider = getattr(req, "provider", "") or ""
    is_gguf = provider == "gguf"
    model = req.model or ("sdxl" if not is_gguf else "flux1-dev")

    from app.services.comfyui_runtime import comfyui_runtime, MODEL_CATALOG, install_state, qwen_missing

    # Managed engine: bring it up on demand, the way the vision capability starts
    # llama-server. An externally-pointed COMFYUI_URL is the user's to keep running.
    if not _is_external() and not comfyui_runtime.running:
        if install_state()["status"] == "running":
            return JSONResponse(status_code=503, content={
                "error": "ComfyUI is installing; try again when the runtime is ready",
                "install_status": install_state(),
            })
        if not await comfyui_runtime.start():
            return JSONResponse(status_code=502, content={"error": (
                "ComfyUI isn't running and couldn't be started"
                + (f": {comfyui_runtime.last_error}" if comfyui_runtime.last_error else ".")
            )})

    base = _base_url()
    try:
        async with aiohttp.ClientSession() as session:
            entry = MODEL_CATALOG.get(model.strip().lower(), {})
            checkpoint, err = (None, None) if entry.get("qwen") else await _resolve_checkpoint(session, model)
            if err:
                # 400 with the specifics: this is a configuration problem, not a server fault,
                # and it must not reach /prompt to fail there as an opaque validation error.
                return JSONResponse(status_code=400, content={"error": err})

            if entry.get("qwen"):
                missing = qwen_missing(model)
                if missing:
                    return JSONResponse(status_code=400, content={
                        "error": "Qwen Image assets are missing",
                        "missing": missing,
                        "download": "/api/comfyui/presets",
                    })
            steps = int(getattr(req, "steps", None) or entry.get("default_steps") or 20)
            # ComfyUI's KSampler requires seed >= 0; the old default of -1 meant every
            # generation was rejected with "Value -1 smaller than min of 0".
            seed = int(getattr(req, "seed", -1) if getattr(req, "seed", None) is not None else -1)
            if seed < 0:
                seed = random.randint(0, 2 ** 32 - 1)
            width = int(entry.get("default_width") or 1024)
            height = int(entry.get("default_height") or 1024)
            if req.size and req.size != "auto":
                parts = req.size.split("x")
                if len(parts) == 2:
                    width, height = int(parts[0]), int(parts[1])

            prompt_data = {
                "prompt": req.message,
                "ckpt_name": checkpoint,
                "steps": steps,
                "cfg": 7.0,
                "width": width,
                "height": height,
                "seed": seed,
                "negative": getattr(req, "negative", "") or "",
                # Base checkpoint supplying CLIP + VAE to a GGUF UNet. Resolved the same way so
                # a missing file is reported up front rather than as a ComfyUI node error.
                "base_checkpoint": checkpoint,
                "model": model,
            }

            build = _build_workflow_qwen if entry.get("qwen") else (_build_workflow_gguf if is_gguf else _build_workflow)
            async with session.post(f"{base}/prompt", json={"prompt": build(prompt_data)}) as resp:
                body = await resp.json(content_type=None)
                if resp.status != 200:
                    # ComfyUI rejects validation failures with 400 + node_errors naming the
                    # node and input. Surface that instead of a raw body dump.
                    return JSONResponse(status_code=502, content={"error": f"ComfyUI rejected the workflow: {_node_errors(body)}"})
                prompt_id = (body or {}).get("prompt_id")

            if not prompt_id:
                return JSONResponse(status_code=502, content={"error": "ComfyUI accepted the prompt but returned no prompt_id"})

            image_data, run_error = await _poll_for_result(session, prompt_id)
            if not image_data:
                return JSONResponse(status_code=502, content={"error": run_error or "ComfyUI timed out"})

        result = await save_generated_image(
            image_bytes=image_data, user_id=user_id, prompt=req.message,
            model=model, provider="gguf" if is_gguf else "comfyui",
            params={"steps": steps, "seed": seed, "size": f"{width}x{height}", "gguf": is_gguf},
        )
        return {"status": "generated", "image_url": result["image_url"]}

    except aiohttp.ClientConnectorError:
        return JSONResponse(status_code=502, content={"error": f"Cannot reach ComfyUI at {base}"})
    except Exception as e:
        logger.error(f"Local image gen error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


def _node_errors(body) -> str:
    """Flatten ComfyUI's `node_errors` map into one readable line."""
    errors = (body or {}).get("node_errors") or {}
    if not errors:
        return str(body)
    parts = []
    for node_id, info in errors.items():
        for e in (info or {}).get("errors", []):
            detail = e.get("message") or e.get("type") or "error"
            extra = e.get("extra_info") or {}
            if extra.get("received_value") is not None:
                detail += f" (got {extra['received_value']!r})"
            parts.append(f"node {node_id}: {detail}")
    return "; ".join(parts) or str(body)


def _build_workflow(params: dict) -> dict:
    """txt2img from a single checkpoint — the shape SD1.5 and SDXL share.

    `ckpt_name` arrives already resolved against the checkpoints ComfyUI reports, never
    assembled from the model key: `"sdxl" + ".safetensors"` was the bug that made every
    generation fail validation.
    """
    return {
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": params.get("seed", 42),
                "steps": params["steps"],
                "cfg": params["cfg"],
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0],
            },
        },
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": params["ckpt_name"]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": params["width"], "height": params["height"], "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": params["prompt"], "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": params.get("negative", ""), "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "lmwebui", "images": ["8", 0]}},
    }


def _build_workflow_gguf(params: dict) -> dict:
    """ComfyUI graph for GGUF-quantized diffusion (needs ComfyUI's GGUF node pack).

    The GGUF UNet loads via `UnetLoaderGGUF`; CLIP + VAE come from a base safetensors checkpoint.
    ponytail: best-effort against the standard node names — the user must have the GGUF nodes + the
    base checkpoint present in ComfyUI.
    """
    return {
        "1": {"class_type": "UnetLoaderGGUF",
              "inputs": {"unet_name": params.get("unet_name") or (params["model"] + ".gguf"),
                         "weight_dtype": "default"}},
        "2": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": params["ckpt_name"]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": params["prompt"], "clip": ["2", 1]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": params.get("negative", ""), "clip": ["2", 1]}},
        "5": {"class_type": "EmptyLatentImage",
              "inputs": {"width": params["width"], "height": params["height"], "batch_size": 1}},
        "6": {"class_type": "KSampler", "inputs": {
            "seed": params.get("seed", 42), "steps": params["steps"], "cfg": params["cfg"],
            "sampler_name": "euler", "scheduler": "normal", "denoise": 1,
            "model": ["1", 0], "positive": ["3", 0], "negative": ["4", 0], "latent_image": ["5", 0]}},
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["2", 2]}},
        "8": {"class_type": "SaveImage", "inputs": {"filename_prefix": "lmwebui", "images": ["7", 0]}},
    }


def _build_workflow_qwen(params: dict) -> dict:
    """Qwen Image 2.1 GGUF graph using the native ComfyUI model folders."""
    from app.services.comfyui_runtime import MODEL_CATALOG, QWEN_ASSETS
    model = MODEL_CATALOG[params["model"]]
    return {
        "1": {"class_type": "UnetLoaderGGUF", "inputs": {"unet_name": model["filename"]}},
        "2": {"class_type": "CLIPLoaderGGUF", "inputs": {"clip_name": QWEN_ASSETS["qwen-image-text-encoder"]["filename"], "type": "qwen_image"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": QWEN_ASSETS["qwen-image-vae"]["filename"]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": params["prompt"], "clip": ["2", 0]}},
        "5": {"class_type": "EmptySD3LatentImage", "inputs": {"width": params["width"], "height": params["height"], "batch_size": 1}},
        "6": {"class_type": "KSampler", "inputs": {"seed": params["seed"], "steps": params["steps"], "cfg": params["cfg"], "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["1", 0], "positive": ["4", 0], "negative": ["4", 0], "latent_image": ["5", 0]}},
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["3", 0]}},
        "8": {"class_type": "SaveImage", "inputs": {"filename_prefix": "lmwebui-qwen", "images": ["7", 0]}},
    }


def _history_error(entry: dict) -> Optional[str]:
    """Pull a human-readable failure out of a ComfyUI history entry.

    A run that fails mid-execution (OOM, a missing custom node, a bad model) finishes with
    `status.status_str == "error"` and **no** outputs. Polling only for outputs therefore
    waited out the full timeout and reported "timed out" — pointing at the wrong problem.
    """
    status = (entry or {}).get("status") or {}
    if status.get("status_str") != "error":
        return None
    for message in status.get("messages") or []:
        # messages are [event_name, payload] pairs; execution_error carries the detail.
        if not isinstance(message, (list, tuple)) or len(message) < 2:
            continue
        payload = message[1] or {}
        if not isinstance(payload, dict):
            continue
        detail = payload.get("exception_message") or payload.get("exception_type")
        if detail:
            node = payload.get("node_type") or payload.get("node_id")
            return f"ComfyUI run failed{f' at {node}' if node else ''}: {detail}"
    return "ComfyUI run failed (no detail reported; see the ComfyUI log)"


async def _poll_for_result(session: aiohttp.ClientSession, prompt_id: str, timeout: int = 120) -> tuple:
    """Wait for a run to finish. Returns (image_bytes, None) or (None, error_message)."""
    import time
    from urllib.parse import urlencode

    base = _base_url()
    start = time.time()
    last_error: Optional[str] = None
    while time.time() - start < timeout:
        try:
            async with session.get(f"{base}/history/{prompt_id}") as resp:
                if resp.status != 200:
                    await asyncio.sleep(1)
                    continue
                data = await resp.json()
                entry = data.get(prompt_id) or {}

                # Check failure before outputs: a failed run has neither, and an errored
                # entry left in history would otherwise be re-read until the timeout.
                failure = _history_error(entry)
                if failure:
                    return None, failure
                last_error = None

                outputs = entry.get("outputs") or {}
                for _node_id, node_out in outputs.items():
                    for img in node_out.get("images", []):
                        query = urlencode({
                            "filename": img["filename"],
                            "subfolder": img.get("subfolder", ""),
                            "type": img.get("type", "output"),
                        })
                        async with session.get(f"{base}/view?{query}") as ir:
                            if ir.status == 200:
                                return await ir.read(), None
        except Exception as exc:
            # Transient (server restarting, connection dropped) — keep polling, but remember
            # why, so a timeout can say something better than "timed out".
            last_error = str(exc)
        await asyncio.sleep(1)
    return None, last_error or f"ComfyUI did not finish within {timeout}s"
