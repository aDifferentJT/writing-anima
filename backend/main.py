"""
Writing-Anima Backend
FastAPI application providing Anima-powered writing analysis
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
import uvicorn
from typing import Any, AsyncGenerator, Never, Optional
import logging
import os
import sys

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import API routers
from src.api import analysis_router, animas_router, projects_router, settings_router
from src import global_init

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, Never]:
    """Application lifespan manager"""
    logger.info("Starting Writing-Anima backend...")
    # Initialize Qdrant connection
    # Initialize configuration
    yield
    logger.info("Shutting down Writing-Anima backend...")
    # Cleanup resources

def setup(allowed_origins: list[str]) -> FastAPI:
    app = FastAPI(
        title="Writing-Anima API",
        description="Anima-powered writing analysis and feedback system",
        version="1.0.0",
        lifespan=lifespan
    )

    logger.info(f"CORS allowed origins: {allowed_origins}")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health_check() -> dict[str, Any]:
        return {
            "status": "healthy",
            "services": {
                "api": "running",
                "qdrant": "pending",
            }
        }

    # Include API routers
    app.include_router(analysis_router)
    app.include_router(animas_router)
    app.include_router(projects_router)
    app.include_router(settings_router)

    # Serve built frontend as static files (production / desktop mode).
    # Must come last — it's a catch-all for any path not matched by API routes.
    if getattr(sys, "frozen", False):
        # py2app sets RESOURCEPATH to Contents/Resources/
        frontend_dist = Path(os.environ["RESOURCEPATH"]) / "frontend" / "dist"
    else:
        frontend_dist = Path(__file__).parent / "frontend" / "dist"

    if frontend_dist.exists():
        @app.get("/animas")
        async def animas_page() -> FileResponse:
            return FileResponse(str(frontend_dist / "animas.html"))

        @app.get("/settings")
        async def settings_page() -> FileResponse:
            return FileResponse(str(frontend_dist / "settings.html"))

        @app.get("/project")
        async def project_page() -> FileResponse:
            return FileResponse(str(frontend_dist / "project.html"))

        @app.get("/project/settings")
        async def project_settings_page() -> FileResponse:
            return FileResponse(str(frontend_dist / "project_settings.html"))

        app.mount("/", StaticFiles(directory=str(frontend_dist), html=True, follow_symlink=True), name="frontend")

    return app

if __name__ == "__main__":
    global_init.run()
    allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
    allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]
    app = setup(allowed_origins)
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
