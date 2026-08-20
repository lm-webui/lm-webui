import json

from app.chat.events import ModelEvent
from app.routes import chat as chat_route


async def _events(request, user_id, conversation_id):
    yield ModelEvent.metadata({"conversation_id": conversation_id})
    yield ModelEvent.done()


class _Orchestrator:
    def __init__(self):
        self.request = None

    def process_request(self, request, user_id, conversation_id):
        self.request = request
        return _events(request, user_id, conversation_id)


def test_stream_route_preserves_image_mode(monkeypatch):
    orchestrator = _Orchestrator()
    monkeypatch.setattr(chat_route, "get_orchestrator", lambda: orchestrator)

    request = {
        "message": "generate a cat",
        "provider": "openai",
        "model": "gpt-image-1",
        "conversation_id": "conversation-1",
        "is_image_mode": True,
    }

    import asyncio

    events = asyncio.run(chat_route.chat_stream(request, {"id": 1}))
    assert events.media_type == "text/event-stream"

    async def consume():
        return [frame async for frame in events.body_iterator]

    frames = asyncio.run(consume())
    assert orchestrator.request.isImageMode is True
    assert any(json.loads(frame.decode().split("data: ", 1)[1])['type'] == "complete" for frame in frames)
