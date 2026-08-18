# === backend/app/models/schemas.py ===
from pydantic import BaseModel
from typing import List, Optional

class ChatRequest(BaseModel):
    message: str
    provider: str
    model: str
    api_key: Optional[str] = None
    endpoint: Optional[str] = None
    conversation_history: Optional[list] = None
    show_raw_response: bool = False
    deep_thinking_mode: bool = False
    user_id: Optional[int] = None
    conversation_id: Optional[str] = None
    # Image generation fields
    size: Optional[str] = None
    quality: Optional[str] = "standard"
    style: Optional[str] = "vivid"
    negative: Optional[str] = None  # ComfyUI negative prompt (local image path only)
    metadata: Optional[dict] = None
    # img2img — base64 data-URI of a source image for image-input-capable models
    image_data_uri: Optional[str] = None


class ModelsResponse(BaseModel):
    models: List[str]
    source: str  # 'live' or 'cache'
