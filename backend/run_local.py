from pathlib import Path
import sys

import uvicorn

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from backend.app.config import get_settings  # noqa: E402


settings = get_settings()


if __name__ == "__main__":
    uvicorn.run(
        "backend.app.main:app",
        host=settings.backend_host,
        port=settings.backend_port,
        reload=False,
        app_dir=str(PROJECT_ROOT),
    )
