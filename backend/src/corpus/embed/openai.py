"""Embedding generation for text chunks using OpenAI API"""

import os
import logging
from openai import AsyncOpenAI

from .base import BaseEmbeddingGenerator
from ...config import EmbeddingConfig

logger = logging.getLogger(__name__)


class OpenAIEmbeddingGenerator(BaseEmbeddingGenerator):
    """Generate embeddings for text using OpenAI API"""

    def __init__(self, embedding_config: EmbeddingConfig):
        """Initialize embedding generator"""
        super().__init__(embedding_config)

        api_key = os.getenv(embedding_config.api_key_env) if embedding_config.api_key_env else None
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = embedding_config.model

        logger.info("Initialized embedding generator with model: %s", self.model)

    async def generate_batch(self, batch: list[str], batch_num: int) -> list[list[float]]:
        """Generate embeddings for a single batch of a list of texts"""
        try:
            logger.debug("Calling OpenAI API for batch %d...", batch_num)
            response = await self.client.embeddings.create(
                model=self.model,
                input=batch,
            )
            logger.debug("Received response from OpenAI for batch %d", batch_num)

            # Extract embeddings
            return [item.embedding for item in response.data]

        except Exception as e:
            logger.error("Error generating embeddings for batch %d: %s", batch_num, e)
            raise
