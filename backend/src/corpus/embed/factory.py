"""Embedding generator factory"""

import logging
from collections.abc import Callable

from ...config import Config
from .base import BaseEmbeddingGenerator
from .mlx import MlxEmbeddingGenerator
from .openai import OpenAIEmbeddingGenerator

logger = logging.getLogger(__name__)


def create_embedding_generator(
    config: Config,
    embedding_id: str,
    progress_callback: Callable[[float | None], None] | None = None,
) -> BaseEmbeddingGenerator:
    embedding_config = config.get_embedding(embedding_id)
    if embedding_config.provider == "openai":
        if progress_callback:
            progress_callback(None)
        return OpenAIEmbeddingGenerator(embedding_config)
    elif embedding_config.provider == "mlx":
        return MlxEmbeddingGenerator(embedding_config, progress_callback)
    else:
        raise ValueError(f"Unsupported embedding provider: {embedding_config.provider}.")
