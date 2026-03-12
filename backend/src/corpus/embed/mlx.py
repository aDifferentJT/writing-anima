"""Embedding generation for text chunks using OpenAI API"""

import os
import logging
from mlx_embeddings.utils import load
from mlx_embeddings.models.base import BaseModelOutput
from typing import cast

from .base import BaseEmbeddingGenerator
from ...config import Config

logger = logging.getLogger(__name__)


class MlxEmbeddingGenerator(BaseEmbeddingGenerator):
    """Generate embeddings for text using OpenAI API"""

    def __init__(self, config: Config):
        """Initialize embedding generator"""
        super().__init__(config)
        self.model, self.tokenizer = load(self.config.embedding.model)

        logger.info(f"Initialized embedding generator with model: {self.model}")

    def _generate_batch(self, batch: list[str], batch_num: int) -> list[list[float]]:
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

            outputs: BaseModelOutput = self.model(
                inputs["input_ids"],
                attention_mask=inputs.get("attention_mask"),
            )

            embeds = outputs.text_embeds  # (B, D) mean pooled + normalized
            assert(embeds is not None)
            logger.debug(f"MLX finished batch {batch_num}; embeds shape={getattr(embeds, 'shape', None)}")

            # Convert MLX array -> Python list of lists
            return cast(list[list[float]], embeds.tolist())

        except Exception as e:
            logger.error(f"Error generating embeddings for batch {batch_num}: {e}")
            raise
