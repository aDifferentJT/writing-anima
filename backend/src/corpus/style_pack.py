"""Style pack generation — builds a diverse set of writing samples from an anima's corpus."""

import logging

from ..api.models import StylePackItem
from ..corpus.embed.base import BaseEmbeddingGenerator
from ..database.vector import get_vector_db

logger = logging.getLogger(__name__)


async def generate_style_pack(
    collection_name: str, size: int, embedder: BaseEmbeddingGenerator
) -> list[StylePackItem]:
    """
    Generate a diverse style pack from a corpus collection.

    Called once after corpus upload completes; the caller is responsible for
    persisting the result on the anima's ``style_pack`` field.

    Returns:
        List of StylePackItem with text and filename for each sample.
    """
    logger.info("Building style pack for collection %s with %d samples...", collection_name, size)

    collection = get_vector_db().get_collection(collection_name)

    seed_embedding = await embedder.generate_one("the")
    candidates = await collection.search(query_vector=seed_embedding, k=size * 5)

    if not candidates:
        logger.warning("No documents found for style pack (collection %s)", collection_name)
        return []

    items: list[StylePackItem] = []
    seen: set[str] = set()

    for result in candidates:
        key = f"{result.metadata.source.value}:{result.metadata.filename}"
        if key not in seen or len(items) < size:
            items.append(StylePackItem(text=result.text, filename=result.metadata.filename))
            seen.add(key)
        if len(items) >= size:
            break

    logger.info("Style pack built: %d samples from %d sources", len(items), len(seen))
    return items
