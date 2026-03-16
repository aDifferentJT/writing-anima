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
    def _generate_batch(self, batch: list[str], batch_num: int) -> list[list[float]]:
        """Generate embeddings for a single batch of a list of texts"""

    def generate(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts"""
        if not texts:
            return []

        all_embeddings = []
        total_batches = (len(texts) + self.batch_size - 1) // self.batch_size

        logger.info(
            "Starting embedding generation for %d texts in %d batches",
            len(texts), total_batches
        )

        # Process in batches
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            batch_num = i // self.batch_size + 1

            logger.info(
                "Processing batch %d/%d (%d texts)...",
                batch_num, total_batches, len(batch)
            )

            all_embeddings.extend(self._generate_batch(batch, batch_num))

            logger.info(
                "✓ Batch %d/%d complete (%d/%d embeddings generated)",
                batch_num, total_batches, len(all_embeddings), len(texts)
            )

        logger.info("✓ Generated all %d embeddings successfully", len(all_embeddings))
        return all_embeddings

    def generate_one(self, text: str) -> list[float]:
        """Generate embedding for a single text"""
        embeddings = self.generate([text])
        return embeddings[0] if embeddings else []
