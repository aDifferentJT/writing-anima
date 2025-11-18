"""Embedding generation for text chunks using MLX"""

import asyncio
import logging
from collections.abc import Awaitable, Callable
import gc
from pathlib import Path
from typing import TypeVar, cast

import mlx
from mlx_embeddings.models.base import BaseModelOutput
from mlx_embeddings.utils import load

import huggingface_hub as hf
from tqdm.auto import tqdm

from .base import BaseEmbeddingGenerator
from ...database.settings import EmbeddingConfig

logger = logging.getLogger(__name__)


async def _download_with_progress(
    model_id: str, callback: Callable[[float], Awaitable[None]]
) -> None:
    """Pre-download all model files from HuggingFace, reporting byte-level progress."""
    api = hf.HfApi()
    siblings = api.model_info(model_id, files_metadata=True).siblings or []
    files_to_download = [
        s
        for s in siblings
        if not (
            cached := hf.try_to_load_from_cache(model_id, s.rfilename)
        )
        or not Path(str(cached)).exists()
    ]
    total_bytes = sum(s.size or 0 for s in files_to_download)
    if total_bytes == 0:
        await callback(1.0)
        return

    bytes_done = 0

    _T = TypeVar("_T")
    class CustomTqdm(tqdm[_T]):  # pylint: disable=unsubscriptable-object,too-few-public-methods
        """Custom tqdm class that reports progress via callback."""
        def update(self, n: float | None = 1) -> None:
            """Update progress and call callback with normalized progress."""
            super().update(n)
            if self.unit == "B":
                asyncio.ensure_future(callback((bytes_done + self.n) / total_bytes))

    await callback(0)
    for sibling in files_to_download:
        logger.info("Downloading %s from %s...", sibling.rfilename, model_id)
        hf.hf_hub_download(repo_id=model_id, filename=sibling.rfilename, tqdm_class=CustomTqdm)
        bytes_done += sibling.size or 0
        await callback(bytes_done / total_bytes)


class MlxEmbeddingGenerator(BaseEmbeddingGenerator):
    """Generate embeddings for text using MLX."""

    def __init__(self, embedding_config: EmbeddingConfig):
        """Initialize embedding generator. Call create() to also run the async download step."""
        super().__init__(embedding_config)
        self.model, self.tokenizer = load(self.embedding_config.model)
        logger.info("Initialized embedding generator with model: %s", self.model)

    def __del__(self) -> None:
        del self.model
        del self.tokenizer
        gc.collect()
        mlx.core.clear_cache()

    @classmethod
    async def create(
        cls,
        embedding_config: EmbeddingConfig,
        progress_callback: Callable[[float | None], Awaitable[None]] | None = None,
    ) -> "MlxEmbeddingGenerator":
        """Async factory: download model weights if needed, then load."""
        if progress_callback:
            try:
                await _download_with_progress(embedding_config.model, progress_callback)
            except Exception as e:  # pylint: disable=broad-exception-caught
                logger.warning("Model download progress tracking failed (%s), loading anyway", e)
        return await asyncio.to_thread(cls, embedding_config)

    # TODO this should use asyncio or something genuinely async
    async def generate_batch(self, batch: list[str], batch_num: int) -> list[list[float]]:
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
                max_length=self.embedding_config.max_length,
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
