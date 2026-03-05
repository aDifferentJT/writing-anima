"""Embedding generation for text chunks using OpenAI API"""

import os
import logging
from typing import List
import mlx_embeddings

from .base import BaseEmbeddingGenerator

logger = logging.getLogger(__name__)


class MlxEmbeddingGenerator(BaseEmbeddingGenerator):
    """Generate embeddings for text using OpenAI API"""

    def __init__(self, config):
        """Initialize embedding generator"""
        super().__init__(config)
        self.model, self.tokenizer = mlx_embeddings.utils.load(self.config.embedding.model)

        logger.info(f"Initialized embedding generator with model: {self.model}")

    def _generate_batch(self, batch: List[str], batch_num: int) -> List[List[float]]:
        """Generate embeddings for a single batch of a list of texts"""
        try:
            logger.debug(f"Using MLX to embed batch {batch_num} (size={len(batch)})...")

            # Tokenize the whole batch (pads + truncates to max_length)
            inputs = self.tokenizer.__call__(
                batch,
                return_tensors="mlx",
                padding=True,
                truncation=True,
                max_length=getattr(self.config.embedding, "max_length", 512),
            )

            outputs = self.model(
                inputs["input_ids"],
                attention_mask=inputs.get("attention_mask"),
            )

            embeds = outputs.text_embeds  # (B, D) mean pooled + normalized
            logger.debug(f"MLX finished batch {batch_num}; embeds shape={getattr(embeds, 'shape', None)}")

            # Convert MLX array -> Python list of lists
            return embeds.tolist()

        except Exception as e:
            logger.error(f"Error generating embeddings for batch {batch_num}: {e}")
            raise
