"""Optional client for the native host bridge."""
import json
import os
import urllib.request


def enabled() -> bool:
    return bool(os.getenv("LMWEBUI_HOST_AGENT_URL") and os.getenv("LMWEBUI_HOST_AGENT_TOKEN"))


def request(path: str, body: dict | None = None) -> dict:
    base = os.environ["LMWEBUI_HOST_AGENT_URL"].rstrip("/")
    data = json.dumps(body or {}).encode()
    req = urllib.request.Request(base + path, data=data if body is not None else None,
                                 headers={"Authorization": "Bearer " + os.environ["LMWEBUI_HOST_AGENT_TOKEN"],
                                          "Content-Type": "application/json"},
                                 method="POST" if body is not None else "GET")
    with urllib.request.urlopen(req, timeout=900) as response:
        return json.loads(response.read())
