"""Embedding generator factory"""

import logging
from collections.abc import Callable

from ...config import Config
from .base import BaseEmbeddingGenerator
from .mlx import MlxEmbeddingGenerator
from .openai import OpenAIEmbeddingGenerator

logger = logging.getLogger(__name__)


class EmbeddingGeneratorFactory:
    """Factory for creating appropriate embedding generator based on provider selection"""

    @staticmethod
    def create(
        config: Config,
        progress_callback: Callable[[float | None], None] | None = None,
    ) -> BaseEmbeddingGenerator:
        if config.embedding.provider == "openai":
            if progress_callback:
                progress_callback(None)
            return OpenAIEmbeddingGenerator(config)
        elif config.embedding.provider == "mlx":
            return MlxEmbeddingGenerator(config, progress_callback)
        else:
            raise ValueError(
                f"Unsupported embedding generator provider: {config.embedding.provider}."
            )
