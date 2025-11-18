"""General database engine setup."""

import logging
from uuid import UUID

from sqlalchemy.engine import Engine, create_engine
from sqlmodel import SQLModel

from ... import global_init, resources
from ...api.models import Anima, Project  # noqa: F401 — re-exported
from ..settings import Model, get as get_settings

logger = logging.getLogger(__name__)

_general_db = global_init.uninit(Engine)


def get_general_db() -> Engine:
    """Get the global database engine (initialized at startup)."""
    return _general_db


def get_model(model_id: UUID) -> Model:
    """Look up a Model by UUID from settings, raising ValueError if not found."""
    for m in get_settings().models:
        if m.id == model_id:
            return m
    raise ValueError(f"Model '{model_id}' not found")


def _init_general_db() -> None:
    """Initialize general database engine at startup."""
    global _general_db  # pylint: disable=global-statement
    data_dir = resources.get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    db_path = data_dir / "general.db"
    _general_db = create_engine(f"sqlite:///{db_path}")
    SQLModel.metadata.create_all(_general_db)


global_init.add(_init_general_db)
