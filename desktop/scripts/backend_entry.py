import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.environ.get("APP_SERVER_HOST", "127.0.0.1"),
        port=int(os.environ.get("APP_SERVER_PORT", "7070")),
        log_level=os.environ.get("APP_SERVER_LOG_LEVEL", "info").lower(),
    )
