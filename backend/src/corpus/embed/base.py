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
        pass

    def generate(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts"""
        if not texts:
            return []

        all_embeddings = []
        total_batches = (len(texts) + self.batch_size - 1) // self.batch_size

        logger.info(f"Starting embedding generation for {len(texts)} texts in {total_batches} batches")

        # Process in batches
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            batch_num = i // self.batch_size + 1

            logger.info(f"Processing batch {batch_num}/{total_batches} ({len(batch)} texts)...")

            all_embeddings.extend(self._generate_batch(batch, batch_num))

            logger.info(
                f"✓ Batch {batch_num}/{total_batches} complete "
                f"({len(all_embeddings)}/{len(texts)} embeddings generated)"
            )

        logger.info(f"✓ Generated all {len(all_embeddings)} embeddings successfully")
        return all_embeddings

    def generate_one(self, text: str) -> list[float]:
        """Generate embedding for a single text"""
        embeddings = self.generate([text])
        return embeddings[0] if embeddings else []
