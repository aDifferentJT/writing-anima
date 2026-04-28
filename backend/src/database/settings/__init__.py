"""Database settings models and pickled settings storage."""

from __future__ import annotations

import logging
import pickle
import tempfile
import uuid
from pathlib import Path
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, Field

from ... import global_init, resources

logger = logging.getLogger(__name__)


class Model(BaseModel):
    """LLM model configuration."""

    id: uuid.UUID = Field(default_factory=uuid.uuid4)
    name: str
    provider: str
    model: str
    description: str
    base_url: str
    api_key: Optional[str] = None
    temperature: float
    max_iterations: int


class LocalQdrantConfig(BaseModel):
    type: Literal["local"] = "local"


class CloudQdrantConfig(BaseModel):
    type: Literal["cloud"] = "cloud"
    url: str = ""
    api_key: Optional[str] = None


VectorDBConfig = Annotated[
    Union[LocalQdrantConfig, CloudQdrantConfig],
    Field(discriminator="type"),
]


class EmbeddingConfig(BaseModel):
    id: str
    name: str
    provider: str  # "openai" or "mlx"
    api_key: Optional[str] = None
    model: str = "text-embedding-3-small"
    dimensions: int = 1536
    batch_size: int = 100
    max_length: int = 512


class Settings(BaseModel):
    """Pickled app settings persisted on disk."""

    models: list[Model] = Field(default_factory=list)
    vector_db: VectorDBConfig = Field(default_factory=LocalQdrantConfig)
    embeddings: list[EmbeddingConfig] = Field(default_factory=list)
    preferred_model_id: Optional[str] = None

    def get_embedding(self, embedding_id: str) -> EmbeddingConfig:
        for emb in self.embeddings:
            if emb.id == embedding_id:
                return emb
        available = ", ".join(e.id for e in self.embeddings)
        raise ValueError(f"Embedding '{embedding_id}' not found. Available: {available}")


_settings: Settings = global_init.uninit(Settings)


def _settings_path() -> Path:
    data_dir = resources.get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir / "settings.pkl"


def _init_settings() -> None:
    global _settings
    try:
        path = _settings_path()
        if path.exists():
            with open(path, "rb") as f:
                loaded = pickle.load(f)
            if isinstance(loaded, Settings):
                _settings = loaded
            elif isinstance(loaded, BaseModel):
                _settings = Settings.model_validate(loaded.model_dump())
            elif isinstance(loaded, dict):
                _settings = Settings.model_validate(loaded)
            else:
                raise TypeError(f"Unsupported payload type: {type(loaded)!r}")
        else:
            raise TypeError("Settings file does not exist")
    except Exception as exc:  # pylint: disable=broad-exception-caught
        logger.warning("Failed to load pickled settings, recreating: %s", exc)
        _settings = Settings()
        _write(_settings)


global_init.add(_init_settings)


def _write(settings: Settings) -> None:
    """Atomically write the current settings to disk."""
    path = _settings_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="wb",
        dir=path.parent,
        prefix=f"{path.stem}.",
        suffix=".tmp",
        delete=False,
    ) as tmp:
        pickle.dump(settings, tmp, protocol=pickle.HIGHEST_PROTOCOL)
        tmp_path = Path(tmp.name)
    tmp_path.replace(path)


def get() -> Settings:
    return _settings


def replace(settings: Settings) -> None:
    global _settings
    _settings = settings
    _write(settings)


def update(changes: dict[str, Any]) -> Settings:
    global _settings
    data = _settings.model_dump()
    data.update(changes)
    _settings = Settings.model_validate(data)
    _write(_settings)
    return _settings
