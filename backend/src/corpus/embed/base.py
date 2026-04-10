"""Embedding generation for text chunks"""

import logging
from abc import ABC, abstractmethod

from ...config import EmbeddingConfig

logger = logging.getLogger(__name__)


class BaseEmbeddingGenerator(ABC):
    """Generate embeddings for text"""

    def __init__(self, embedding_config: EmbeddingConfig):
        """Initialize embedding generator"""
        self.embedding_config = embedding_config
        self.batch_size = embedding_config.batch_size

    @abstractmethod
    async def generate_batch(self, batch: list[str], batch_num: int) -> list[list[float]]:
        """Generate embeddings for a single batch of a list of texts"""

    async def generate_one(self, text: str) -> list[float]:
        """Generate embedding for a single text"""
        result = await self.generate_batch([text], 1)
        return result[0] if result else []
