"""Tool definitions and implementations"""

import logging
import os
from typing import Any, NamedTuple, Optional

from openai import OpenAI
from openai.types.chat import ChatCompletionFunctionToolParam

from ..config import Config
from ..corpus.embed.factory import create_embedding_generator
from ..database.vector import VectorDatabase
from ..database.vector.schema import CorpusDocumentMetadata, SearchFilters, SourceType

logger = logging.getLogger(__name__)


class WritingSample(NamedTuple):
    """A writing sample with metadata and similarity score"""

    text: str
    metadata: CorpusDocumentMetadata
    similarity: float


class OodResult(NamedTuple):
    """Result of out-of-distribution check"""

    is_ood: bool
    confidence: float
    reasoning: str


class CorpusSearchTool:
    """Search tool for corpus retrieval"""

    def __init__(self, collection_name: str, config: Config, embedding_provider: str):
        """
        Initialize search tool.

        Args:
            collection_name: Name of the collection to search (e.g., "anima_jules")
            config: Configuration object
            embedding_provider: Embedding provider used to build this corpus
        """
        self.config = config
        self.collection_name = collection_name
        self.db = VectorDatabase(collection_name, config)
        self.embedder = create_embedding_generator(config, embedding_provider)
        self._style_pack_cache: Optional[list[WritingSample]] = None  # Cache diverse style examples

    def get_style_pack(self) -> list[WritingSample]:
        """
        Get diverse representative writing samples for style grounding.
        Uses caching to avoid recomputing.

        Returns:
            List of diverse document samples
        """
        if self._style_pack_cache is not None:
            return self._style_pack_cache

        if not self.config.retrieval.style_pack_enabled:
            return []

        size = self.config.retrieval.style_pack_size
        logger.info("Building style pack with %d diverse samples...", size)

        # Get a random sample by searching for common words
        # This gives us a diverse starting set
        seed_query = "the"  # Very common word
        seed_embedding = self.embedder.generate_one(seed_query)

        # Get more results than we need for diversity selection
        candidates = self.db.search(
            query_vector=seed_embedding,
            k=size * 5,  # Get 5x to select diverse subset
        )

        if not candidates:
            logger.warning("No documents found for style pack")
            return []

        # Simple diversity selection: pick documents from different sources/times
        diverse_samples: list[WritingSample] = []
        seen_sources = set()

        for result in candidates:
            filename = result.metadata.filename
            source = result.metadata.source.value

            # Prioritize diversity in source and file
            key = f"{source}:{filename}"

            if key not in seen_sources or len(diverse_samples) < size:
                diverse_samples.append(
                    WritingSample(
                        text=result.text,
                        metadata=result.metadata,
                        similarity=result.similarity,
                    )
                )
                seen_sources.add(key)

            if len(diverse_samples) >= size:
                break

        logger.info(
            "Style pack created with %d samples from %d sources",
            len(diverse_samples), len(seen_sources)
        )
        self._style_pack_cache = diverse_samples
        return diverse_samples

    def search(
        self,
        query: str,
        k: Optional[int] = None,
        source_filter: Optional[list[str]] = None,
    ) -> list[dict[str, Any]]:
        """
        Search the user's corpus for relevant text.

        Args:
            query: Search query
            k: Number of results to return (default from config)
            source_filter: Optional list of source types to filter by

        Returns:
            List of search results with text, metadata, and similarity scores
        """
        # Use default k if not provided
        if k is None:
            k = self.config.retrieval.default_k

        # Validate k
        k = min(k, self.config.retrieval.max_k)

        logger.debug("Searching corpus for: '%s' (k=%d)", query, k)

        # Generate query embedding
        query_embedding = self.embedder.generate_one(query)

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
        results = self.db.hybrid_search(
            query_text=query,
            query_vector=query_embedding,
            k=k,
            filters=filters,
        )

        # Note: Hybrid search uses RRF scores (or semantic scores), ranked by relevance
        logger.info("Hybrid search '%s' (k=%d): Found %d results", query, k, len(results))

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
                                f"content and style grounding. Max: {self.config.retrieval.max_k}"
                            ),
                            "default": self.config.retrieval.default_k,
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


class IncrementalReasoningTool:
    """Tool for detecting OOD queries and providing reasoning guidance"""

    def __init__(self, collection_name: str, anima_name: str, config: Config, embedding_provider: str):
        """
        Initialize incremental reasoning tool.

        Args:
            collection_name: Name of the corpus collection
            anima_name: Name of the anima (for context in prompts)
            config: Configuration object
            embedding_provider: Embedding provider used to build this corpus
        """
        self.config = config
        self.collection_name = collection_name
        self.anima_name = anima_name
        self.db = VectorDatabase(collection_name, config)
        self.embedder = create_embedding_generator(config, embedding_provider)

        # Initialize OpenAI client for OOD checks
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            logger.warning(
                "OPENAI_API_KEY not found - incremental reasoning tool disabled"
            )
            self.client = None
        else:
            self.client = OpenAI(api_key=api_key)

    def check_and_guide(self, query: str) -> dict[str, Any]:
        """
        Check if query is out-of-distribution and provide reasoning guidance.

        Args:
            query: The user's query

        Returns:
            Dict with is_ood, confidence, guidance, and corpus_concepts
        """
        if not self.config.retrieval.incremental_mode.enabled:
            return {"is_ood": False, "message": "Incremental mode is disabled"}

        if self.client is None:
            return {
                "is_ood": False,
                "error": "OpenAI client not initialized - check API key",
            }

        logger.info("Checking if query is OOD: '%s...'", query[:100])

        # Step 1: Find related corpus concepts
        corpus_concepts = self._find_related_concepts(query)

        # Step 2: Use LLM to check if query is OOD
        ood_result = self._check_ood(query, corpus_concepts)

        if not ood_result.is_ood:
            return {
                "is_ood": False,
                "confidence": ood_result.confidence,
                "message": (
                    "Query appears to be within corpus distribution. "
                    "Use standard corpus search."
                ),
            }

        # Step 3: Generate reasoning guidance
        guidance = self._generate_guidance(query, corpus_concepts, ood_result)

        logger.info("OOD detected (confidence: %.2f)", ood_result.confidence)

        return {
            "is_ood": True,
            "confidence": ood_result.confidence,
            "guidance": guidance,
            "corpus_concepts": corpus_concepts,
            "reasoning": ood_result.reasoning,
        }

    def _find_related_concepts(self, query: str) -> list[str]:
        """
        Find related concepts in corpus using semantic search.

        Args:
            query: The user's query

        Returns:
            List of related concept descriptions from corpus
        """
        try:
            # Generate embedding for query
            query_embedding = self.embedder.generate_one(query)

            # Search for related content
            max_concepts = self.config.retrieval.incremental_mode.max_corpus_concepts
            results = self.db.search(query_vector=query_embedding, k=max_concepts)

            # Extract key concepts/topics from top results
            concepts = []
            for result in results:
                # Get a snippet to represent this concept
                text = result.text[:200].replace("\n", " ").strip()
                source = result.metadata.source.value
                concepts.append(f"{text}... (from {source})")

            return concepts

        except Exception as e:
            logger.error("Error finding related concepts: %s", e)
            return []

    def _check_ood(self, query: str, corpus_concepts: list[str]) -> OodResult:
        """
        Use LLM to determine if query is out-of-distribution.

        Args:
            query: The user's query
            corpus_concepts: Related concepts from corpus

        Returns:
            Dict with is_ood, confidence, and reasoning
        """
        concepts_text = (
            "\n".join([f"- {c}" for c in corpus_concepts])
            if corpus_concepts
            else "No closely related content found."
        )

        prompt = f"""You are analyzing whether a query can be directly answered from a person's writing corpus.

ANIMA: {self.anima_name}

QUERY: "{query}"

RELATED CORPUS CONTENT:
{concepts_text}

TASK: Determine if this query is OUT-OF-DISTRIBUTION (OOD).

A query is OOD if:
- It asks about topics/concepts not covered in the corpus
- It requires knowledge or perspectives not present in the person's writing
- The related content found is only tangentially related

A query is IN-DISTRIBUTION if:
- The person has directly written about this topic
- Their views/thoughts on this can be found in the corpus
- The related content is directly relevant to answering the query

Respond in JSON format:
{{
    "is_ood": true/false,
    "confidence": 0.0-1.0,
    "reasoning": "Brief explanation of your assessment"
}}"""

        try:
            assert self.client

            response = self.client.chat.completions.create(
                model=self.config.retrieval.incremental_mode.ood_check_model,
                messages=[{"role": "user", "content": prompt}],
                response_format={"type": "json_object"},
                temperature=0.3,
                max_tokens=300,
            )

            import json

            content = response.choices[0].message.content
            assert content
            result = OodResult(**json.loads(content))

            logger.debug("OOD check result: %s", result)
            return result

        except Exception as e:
            logger.error("Error in OOD check: %s", e)
            return OodResult(
                is_ood=False,
                confidence=0.0,
                reasoning=f"Error during OOD check: {str(e)}",
            )

    def _generate_guidance(
        self,
        query: str,
        corpus_concepts: list[str],
        ood_result: OodResult,
    ) -> str:
        """
        Generate natural language reasoning guidance for OOD query.

        Args:
            query: The user's query
            corpus_concepts: Related concepts from corpus
            ood_result: Result from OOD check

        Returns:
            Natural language guidance string
        """
        concepts_list = (
            "\n".join([f"- {c}" for c in corpus_concepts[:3]])
            if corpus_concepts
            else "No directly related content found."
        )

        guidance = f"""This query extends beyond your direct corpus content. To address it thoughtfully while maintaining your authentic voice:

**Foundation Phase:**
First, ground yourself in what you have actually written about related concepts. Search your corpus for:
{concepts_list}

Let these genuine thoughts form your foundation. Review them thoroughly to immerse yourself in your actual views and reasoning patterns.

**Bridging Phase:**
Once grounded, build incrementally from that foundation. Consider:
- How do the logical extensions of your documented views apply here?
- What frameworks or thinking patterns from your writing are relevant?
- Where does your actual knowledge end and extrapolation begin?

**Response Phase:**
Address the query while:
- Maintaining your characteristic voice, tone, and thinking style
- Being explicit when you're reasoning beyond your documented views
- Not claiming to have written about things you haven't
- Showing how you would think about this based on your established patterns

The goal is thoughtful extrapolation that feels authentic to your intellectual style, not invention of views you've never held. Your thinking approach should remain consistent even when addressing new territory."""

        return guidance

    def get_tool_definition_openai(self) -> ChatCompletionFunctionToolParam:
        """Get tool definition for OpenAI/DeepSeek API format"""
        return {
            "type": "function",
            "function": {
                "name": "check_incremental_reasoning",
                "description": "Check if a query is outside your corpus distribution and get guidance for incremental reasoning. Use this when a query seems to ask about topics you may not have directly written about. Returns whether the query is out-of-distribution along with a reasoning approach.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "The query to check for out-of-distribution content",
                        }
                    },
                    "required": ["query"],
                },
            },
        }
