"""Embedding generation for text chunks using MLX"""

import logging
from collections.abc import Callable
from pathlib import Path
from typing import cast

from mlx_embeddings.models.base import BaseModelOutput
from mlx_embeddings.utils import load

from .base import BaseEmbeddingGenerator
from ...config import Config

logger = logging.getLogger(__name__)


def _download_with_progress(model_id: str, callback: Callable[[float], None]) -> None:
    """Pre-download all model files from HuggingFace, reporting byte-level progress."""
    from huggingface_hub import HfApi, hf_hub_download, try_to_load_from_cache
    from huggingface_hub.utils import tqdm  # type: ignore[attr-defined]

    api = HfApi()
    siblings = api.model_info(model_id, files_metadata=True).siblings or []
    files_to_download = [
        s for s in siblings
        if not (cached := try_to_load_from_cache(model_id, s.rfilename)) or not Path(str(cached)).exists()
    ]
    total_bytes = sum(s.size or 0 for s in files_to_download)
    if total_bytes == 0:
        callback(1.0)
        return

    bytes_done = 0

    class custom_tqdm(tqdm):
        def update(self, n: int = 1) -> None:
            super().update(n)
            if self.unit == "B":
                callback((bytes_done + self.n) / total_bytes)

    callback(0)
    for sibling in files_to_download:
        logger.info("Downloading %s from %s...", sibling.rfilename, model_id)
        hf_hub_download(repo_id=model_id, filename=sibling.rfilename, tqdm_class=custom_tqdm)
        bytes_done += sibling.size or 0
        callback(bytes_done / total_bytes)


class MlxEmbeddingGenerator(BaseEmbeddingGenerator):
    """Generate embeddings for text using MLX"""

    def __init__(self, config: Config, progress_callback: Callable[[float], None] | None = None):
        """Initialize embedding generator"""
        super().__init__(config)
        model_name = self.config.embedding.model
        if progress_callback:
            try:
                _download_with_progress(model_name, progress_callback)
            except Exception as e:
                logger.warning("Model download progress tracking failed (%s), loading anyway", e)
        self.model, self.tokenizer = load(model_name)
        logger.info("Initialized embedding generator with model: %s", self.model)

    def generate_batch(self, batch: list[str], batch_num: int) -> list[list[float]]:
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
