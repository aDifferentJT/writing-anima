"""
Writing-Anima Backend
FastAPI application providing Anima-powered writing analysis
"""

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import uvicorn
from typing import Any, AsyncGenerator, Never, Optional
import logging
import os

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Import API routers
from src.api import analysis_router, personas_router, projects_router

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, Never]:
    """Application lifespan manager"""
    logger.info("Starting Writing-Anima backend...")
    # Initialize Qdrant connection
    # Initialize configuration
    yield
    logger.info("Shutting down Writing-Anima backend...")
    # Cleanup resources

app = FastAPI(
    title="Writing-Anima API",
    description="Anima-powered writing analysis and feedback system",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration for React frontend
# Read allowed origins from environment variable
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",")]

logger.info(f"CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root() -> dict[str, str]:
    """Root endpoint"""
    return {
        "message": "Writing-Anima API",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/api/health")
async def health_check() -> dict[str, Any]:
    """Health check endpoint"""
    # TODO: Add Qdrant connection check
    return {
        "status": "healthy",
        "services": {
            "api": "running",
            "qdrant": "pending",  # Will check in Phase 2
        }
    }

# Include API routers
app.include_router(analysis_router)
app.include_router(personas_router)
app.include_router(projects_router)

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
