"""
General database engine setup.
Model definitions live in src/api/models.py — imported here for re-export
so existing code that imports from this module continues to work.
"""

from sqlmodel import SQLModel, create_engine

from ...api.models import Persona, Project  # noqa: F401 — re-exported

general_db = create_engine("sqlite:///general.db")

SQLModel.metadata.create_all(general_db)
