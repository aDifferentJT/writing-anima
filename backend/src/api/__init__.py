"""
API package
"""

from .analysis import router as analysis_router
from .animas import router as animas_router
from .projects import router as projects_router

__all__ = ["analysis_router", "animas_router", "projects_router"]
