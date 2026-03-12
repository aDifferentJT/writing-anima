"""Embedding generation for text chunks using OpenAI API"""

import os
import logging
from typing import Optional
from openai import OpenAI

from .base import BaseEmbeddingGenerator
from ...config import Config

logger = logging.getLogger(__name__)


class OpenAIEmbeddingGenerator(BaseEmbeddingGenerator):
    """Generate embeddings for text using OpenAI API"""

    def __init__(self, config: Config):
        """Initialize embedding generator"""
        super().__init__(config)

        api_key: Optional[str]
        if self.config.embedding.api_key_env:
            api_key = os.getenv(self.config.embedding.api_key_env)

        self.client = OpenAI(api_key=api_key)
        self.model = self.config.embedding.model

        logger.info(f"Initialized embedding generator with model: {self.model}")

    def _generate_batch(self, batch: list[str], batch_num: int) -> list[list[float]]:
        """Generate embeddings for a single batch of a list of texts"""
        try:
            logger.debug(f"Calling OpenAI API for batch {batch_num}...")
            response = self.client.embeddings.create(
                model=self.model,
                input=batch,
            )
            logger.debug(f"Received response from OpenAI for batch {batch_num}")

            # Extract embeddings
            return [item.embedding for item in response.data]

        except Exception as e:
            logger.error(f"Error generating embeddings for batch {batch_num}: {e}")
            raise
