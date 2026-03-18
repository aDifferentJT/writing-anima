"""Embedding generation for text chunks"""

import logging
from abc import ABC, abstractmethod

from ...config import Config

logger = logging.getLogger(__name__)


class BaseEmbeddingGenerator(ABC):
    """Generate embeddings for text"""

    def __init__(self, config: Config):
        """Initialize embedding generator"""
        self.config = config
        self.batch_size = config.embedding.batch_size

    @abstractmethod
    def generate_batch(self, batch: list[str], batch_num: int) -> list[list[float]]:
        """Generate embeddings for a single batch of a list of texts"""

    def generate_one(self, text: str) -> list[float]:
        """Generate embedding for a single text"""
        result = self.generate_batch([text], 1)
        return result[0] if result else []
