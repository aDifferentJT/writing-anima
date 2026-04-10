"""
General database engine setup.
Model definitions live in src/api/models.py — imported here for re-export
so existing code that imports from this module continues to work.
"""

from sqlalchemy.engine import Engine, create_engine
from sqlmodel import SQLModel

from ... import global_init
from ...api.models import Anima, Project  # noqa: F401 — re-exported

_general_db = global_init.uninit(Engine)


def get_general_db() -> Engine:
    """Get the global database engine (initialized at startup)."""
    return _general_db


def _init_general_db() -> None:
    """Initialize general database engine at startup."""
    global _general_db  # pylint: disable=global-statement
    _general_db = create_engine("sqlite:///general.db")
    SQLModel.metadata.create_all(_general_db)


global_init.add(_init_general_db)
