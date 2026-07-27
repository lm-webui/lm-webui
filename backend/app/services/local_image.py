"""
Local Image Generation — ComfyUI client for SD/Flux/LTX.
"""
import logging
import json
import asyncio
import aiohttp
import os
from typing import Optional
from fastapi.responses import JSONResponse
from app.models.schemas import ChatRequest
from app.services.save_generated_image import save_generated_image
from datetime import datetime

logger = logging.getLogger(__name__)

COMFYUI_BASE = os.getenv("COMFYUI_URL", "http://127.0.0.1:8188")

WORKFLOWS = {
    "sdxl": "sdxl_txt2img.json",
    "flux-dev": "flux_txt2img.json",
    "flux-schnell": "flux_schnell_txt2img.json",
    "sd3": "sd3_txt2img.json",
    "ltx": "ltx_video.json",
}


async def generate_image_local(req: ChatRequest, background_tasks=None):
    user_id = req.user_id
    if not user_id:
        return JSONResponse(status_code=400, content={"error": "User ID required"})

    model = req.model or "sdxl"
    if model not in WORKFLOWS:
        return JSONResponse(status_code=400, content={"error": f"Unknown model: {model}"})

    try:
        async with aiohttp.ClientSession() as session:
            steps = int(getattr(req, "steps", 20) or 20)
            seed = int(getattr(req, "seed", -1) or -1)
            width, height = 1024, 1024
            if req.size and req.size != "auto":
                parts = req.size.split("x")
                if len(parts) == 2:
                    width, height = int(parts[0]), int(parts[1])

            prompt_data = {
                "prompt": req.message,
                "model": model,
                "steps": steps,
                "cfg": 7.0,
                "width": width,
                "height": height,
                "seed": seed,
            }

            async with session.post(
                f"{COMFYUI_BASE}/prompt",
                json={"prompt": await _build_workflow(prompt_data)},
            ) as resp:
                if resp.status != 200:
                    return JSONResponse(status_code=502, content={"error": f"ComfyUI error: {await resp.text()}"})
                queue = await resp.json()
                prompt_id = queue.get("prompt_id")

            image_data = await _poll_for_result(session, prompt_id)
            if not image_data:
                return JSONResponse(status_code=502, content={"error": "ComfyUI timed out"})

        result = await save_generated_image(
            image_bytes=image_data, user_id=user_id, prompt=req.message,
            model=model, provider="local",
            params={"steps": steps, "seed": seed, "size": f"{width}x{height}"},
        )
        return {"status": "generated", "image_url": result["image_url"]}

    except aiohttp.ClientConnectorError:
        return JSONResponse(status_code=502, content={"error": f"Cannot reach ComfyUI at {COMFYUI_BASE}"})
    except Exception as e:
        logger.error(f"Local image gen error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})


async def _build_workflow(params: dict) -> dict:
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
        "4": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": params["model"] + ".safetensors"}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": params["width"], "height": params["height"], "batch_size": 1}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": params["prompt"], "clip": ["4", 1]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"text": "", "clip": ["4", 1]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": ["3", 0], "vae": ["4", 2]}},
        "9": {"class_type": "SaveImage", "inputs": {"filename_prefix": "lmwebui", "images": ["8", 0]}},
    }


async def _poll_for_result(session: aiohttp.ClientSession, prompt_id: str, timeout: int = 120) -> Optional[bytes]:
    import time
    start = time.time()
    while time.time() - start < timeout:
        try:
            async with session.get(f"{COMFYUI_BASE}/history/{prompt_id}") as resp:
                if resp.status != 200:
                    await asyncio.sleep(1)
                    continue
                data = await resp.json()
                outputs = data.get(prompt_id, {}).get("outputs", {})
                if outputs:
                    for node_id, node_out in outputs.items():
                        for img in node_out.get("images", []):
                            url = f"{COMFYUI_BASE}/view?filename={img['filename']}&subfolder={img.get('subfolder', '')}&type={img.get('type', 'output')}"
                            async with session.get(url) as ir:
                                return await ir.read()
        except Exception:
            pass
        await asyncio.sleep(1)
    return None
