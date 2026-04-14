"""Embedding generator factory"""

import logging
from collections.abc import Awaitable, Callable
from weakref import WeakValueDictionary

from ...config import EmbeddingConfig
from .base import BaseEmbeddingGenerator
from .mlx import MlxEmbeddingGenerator
from .openai import OpenAIEmbeddingGenerator

logger = logging.getLogger(__name__)

_cache: WeakValueDictionary[tuple[str, str], BaseEmbeddingGenerator] = WeakValueDictionary()


async def create_embedding_generator(
    embedding_config: EmbeddingConfig,
    progress_callback: Callable[[float | None], Awaitable[None]] | None = None,
) -> BaseEmbeddingGenerator:
    """Create an embedding generator based on config provider.

    Generators are cached by (provider, model) — the cache holds weak references,
    so an entry is evicted automatically once nothing else holds the generator.
    """
    key = (embedding_config.provider, embedding_config.model)
    cached = _cache.get(key)
    if cached is not None:
        return cached

    if embedding_config.provider == "openai":
        if progress_callback:
            await progress_callback(None)
        generator: BaseEmbeddingGenerator = OpenAIEmbeddingGenerator(embedding_config)
    elif embedding_config.provider == "mlx":
        generator = await MlxEmbeddingGenerator.create(embedding_config, progress_callback)
    else:
        raise ValueError(f"Unsupported embedding provider: {embedding_config.provider}.")

    _cache[key] = generator
    return generator
