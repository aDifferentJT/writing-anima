"""Embedding generator factory"""

import logging
from typing import Optional, Union

from ...config import Config, get_config
from .base import BaseEmbeddingGenerator
from .mlx import MlxEmbeddingGenerator
from .openai import OpenAIEmbeddingGenerator

logger = logging.getLogger(__name__)


class EmbeddingGeneratorFactory:
    """Factory for creating appropriate embedding generator based on provider selection"""

    @staticmethod
    def create(
        config: Optional[Config] = None,
    ) -> BaseEmbeddingGenerator:
        """
        Create the embedding generator instance.

        Args:
            config: Optional configuration object

        Returns:
            Embedding generator instance

        Raises:
            ValueError: If config.embedding.provider is not supported
        """
        if config is None:
            config = get_config()

        if config.embedding.provider == "openai":
            return OpenAIEmbeddingGenerator(config)
        elif config.embedding.provider == "mlx":
            return MlxEmbeddingGenerator(config)
        else:
            raise ValueError(
                f"Unsupported embedding generator provider: {config.embedding.provider}."
            )
