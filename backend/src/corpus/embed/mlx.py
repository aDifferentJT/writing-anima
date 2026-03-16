"""Embedding generation for text chunks using OpenAI API"""

import logging
from typing import cast

from mlx_embeddings.models.base import BaseModelOutput
from mlx_embeddings.utils import load

from .base import BaseEmbeddingGenerator
from ...config import Config

logger = logging.getLogger(__name__)


class MlxEmbeddingGenerator(BaseEmbeddingGenerator):
    """Generate embeddings for text using OpenAI API"""

    def __init__(self, config: Config):
        """Initialize embedding generator"""
        super().__init__(config)
        self.model, self.tokenizer = load(self.config.embedding.model)

        logger.info("Initialized embedding generator with model: %s", self.model)

    def _generate_batch(self, batch: list[str], batch_num: int) -> list[list[float]]:
        """Generate embeddings for a single batch of a list of texts"""
        try:
            logger.debug("Using MLX to embed batch %d (size=%d)...", batch_num, len(batch))

            # Tokenize the whole batch (pads + truncates to max_length)
            # pylint: disable-next=unnecessary-dunder-call
            inputs = self.tokenizer.__call__(
                batch,
                return_tensors="mlx",
                padding=True,
                truncation=True,
                max_length=self.config.embedding.max_length,
            )

            outputs: BaseModelOutput = self.model(
                inputs["input_ids"],
                attention_mask=inputs.get("attention_mask"),
            )

            embeds = outputs.text_embeds  # (B, D) mean pooled + normalized
            assert embeds is not None
            logger.debug(
                "MLX finished batch %d; embeds shape=%s",
                batch_num, embeds.shape
            )

            # Convert MLX array -> Python list of lists
            return cast(list[list[float]], embeds.tolist())

        except Exception as e:
            logger.error("Error generating embeddings for batch %d: %s", batch_num, e)
            raise
