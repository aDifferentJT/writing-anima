"""
API package
"""

from .analysis import router as analysis_router
from .animas import router as animas_router
from .projects import router as projects_router
from .settings import router as settings_router

__all__ = ["analysis_router", "animas_router", "projects_router", "settings_router"]
