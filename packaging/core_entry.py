import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend")))

import uvicorn

from app.main import app


if __name__ == "__main__":
    uvicorn.run(
        app,
        host=os.getenv("LMWEBUI_HOST", "0.0.0.0"),
        port=int(os.getenv("LMWEBUI_PORT", "7070")),
    )
