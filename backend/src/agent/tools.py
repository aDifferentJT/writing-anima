"""Tool definitions and implementations"""

import logging
from typing import Any, NamedTuple, Optional

from openai.types.chat import ChatCompletionFunctionToolParam

from ..database import settings as settings_db
from ..corpus.embed.factory import create_embedding_generator
from ..database.vector import VectorCollection
from ..database.vector.schema import CorpusDocumentMetadata, SearchFilters, SourceType

logger = logging.getLogger(__name__)


class WritingSample(NamedTuple):
    """A writing sample with metadata and similarity score"""

    text: str
    metadata: CorpusDocumentMetadata
    similarity: float


class CorpusSearchTool:
    """Search tool for corpus retrieval"""

    def __init__(self, collection: VectorCollection, embedding_provider: str):
        """
        Initialize search tool.

        Args:
            collection: VectorCollection instance to search
            embedding_provider: Embedding provider used to build this corpus
        """
        self.collection = collection
        self.embedding_provider = embedding_provider

    async def search(
        self,
        query: str,
        k: Optional[int] = None,
        source_filter: Optional[list[str]] = None,
    ) -> list[dict[str, Any]]:
        """
        Search the user's corpus for relevant text.

        Args:
            query: Search query
            k: Number of results to return (default from settings)
            source_filter: Optional list of source types to filter by

        Returns:
            List of search results with text, metadata, and similarity scores
        """
        # Cache settings reference to avoid multiple get() calls
        settings = settings_db.get()

        # Use default k if not provided
        if k is None:
            k = settings.retrieval.default_k

        # Validate k - ensure 1 <= k <= max_k
        k = min(k, settings.retrieval.max_k)

        logger.debug("Searching corpus for: '%s' (k=%d)", query, k)

        # Generate query embedding
        embedder = await create_embedding_generator(
            settings.get_embedding(self.embedding_provider)
        )
        query_embedding = await embedder.generate_one(query)
        del embedder

        # Build filters
        filters = None
        if source_filter:
            filters = SearchFilters(
                source_filter=
                    [SourceType(s) for s in source_filter]
                    if source_filter
                    else None,
            )

        # Execute hybrid search (combines semantic + keyword matching)
        results = await self.collection.hybrid_search(
            query_text=query,
            query_vector=query_embedding,
            k=k,
            filters=filters,
        )

        # Note: Hybrid search uses RRF scores (or semantic scores), ranked by relevance
        logger.info("Hybrid search '%s' (k=%d): Found %d results",
                    query, k, len(results))

        if results:
            logger.info(
                "  Top result score: %.3f, Avg score: %.3f",
                results[0].similarity, sum(r.similarity for r in results) / len(results)
            )

            # Log preview of top 3 results for debugging
            logger.debug("Top 3 results:")
            for i, r in enumerate(results[:3], 1):
                preview = r.text[:100].replace("\n", " ")
                source = r.metadata.source.value
                file_name = r.metadata.filename
                logger.debug("  %d. [%s/%s] %s...", i, source, file_name, preview)

        # Convert to dict format for tool response
        return [
            {
                "text": result.text,
                "metadata": result.metadata,
                "similarity": result.similarity,
            }
            for result in results
        ]

    def get_tool_definition_openai(self) -> ChatCompletionFunctionToolParam:
        """Get tool definition for OpenAI/DeepSeek API format"""
        return {
            "type": "function",
            "function": {
                "name": "search_corpus",
                "description": (
                    "Search the user's writing corpus to retrieve examples of BOTH "
                    "their ideas AND their writing style. Returns excerpts showing how "
                    "they write, think, and express themselves. Use k=100 for "
                    "comprehensive retrieval that provides both content and style grounding."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": (
                                "Search query - be specific about what you're looking for. "
                                "Try different phrasings if first search doesn't "
                                "return enough results."
                            ),
                        },
                        "k": {
                            "type": "integer",
                            "description": (
                                "Number of results to return. Use k=100 for comprehensive "
                                "content and style grounding. "
                                f"Max: {settings_db.get().retrieval.max_k}"
                            ),
                            "default": settings_db.get().retrieval.default_k,
                        },
                        "source_filter": {
                            "type": "array",
                            "description": "Optional filter by source type",
                            "items": {
                                "type": "string",
                                "enum": ["email", "chat", "document", "code", "note"],
                            },
                        },
                    },
                    "required": ["query"],
                },
            },
        }
