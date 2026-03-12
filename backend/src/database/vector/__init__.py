"""Vector database interface for Qdrant"""

import logging
from datetime import datetime
import typing
from typing import Any, NamedTuple, Optional, TypedDict, cast
from uuid import uuid4

from qdrant_client import QdrantClient
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import (
    Condition,
    Distance,
    FieldCondition,
    Filter,
    MatchAny,
    MatchText,
    PayloadSchemaType,
    PointStruct,
    Range,
    TextIndexParams,
    TokenizerType,
    VectorParams,
)

from ...config import Config
from .schema import CorpusDocument, SearchFilters, SearchResult, SourceType

logger = logging.getLogger(__name__)


class Document(TypedDict):
    text: str
    metadata: dict[str, Any]


class VectorDatabase:
    """Vector database interface for corpus storage and retrieval"""

    def __init__(self, collection_name: str, config: Config):
        """
        Initialize vector database connection.

        Args:
            collection_name: Name of the collection to use (e.g., "persona_jules")
            config: Optional configuration object
        """
        self.config = config
        self.collection_name = collection_name

        # Initialize Qdrant client
        try:
            # Check if we're using a cloud URL (has https:// or contains cloud.qdrant.io)
            host = config.vector_db.host
            port = config.vector_db.port
            is_cloud = host.startswith("https://") or "cloud.qdrant.io" in host

            if is_cloud:
                # For Qdrant Cloud, use URL parameter with HTTPS
                # Construct full URL if not already complete
                if not host.startswith("https://"):
                    url = f"https://{host}:{port}"
                else:
                    url = host

                logger.info(f"Connecting to Qdrant Cloud at {url}")
                self.client = QdrantClient(
                    url=url,
                    api_key=config.vector_db.api_key,
                    https=True,  # Force HTTPS
                )
            else:
                # For local Qdrant, use host/port
                self.client = QdrantClient(
                    host=host,
                    port=port,
                    api_key=config.vector_db.api_key,
                )

            # Test connection by getting collections
            self.client.get_collections()

            logger.info(
                f"Connected to Qdrant at {config.vector_db.host}:{config.vector_db.port}, collection: {collection_name}"
            )
        except ConnectionRefusedError as e:
            error_msg = (
                f"Failed to connect to Qdrant at {config.vector_db.host}:{config.vector_db.port}. "
                f"Is Qdrant running? If using Docker, start it with: docker compose up -d"
            )
            logger.error(error_msg)
            raise ConnectionError(error_msg) from e
        except Exception as e:
            error_msg = f"Error connecting to Qdrant: {e}"
            logger.error(error_msg)
            raise

    def create_collection(self, force: bool = False) -> None:
        """Create collection if it doesn't exist"""
        try:
            # Check if collection exists
            collections = self.client.get_collections().collections
            exists = any(c.name == self.collection_name for c in collections)

            if exists and force:
                logger.warning(f"Deleting existing collection: {self.collection_name}")
                self.client.delete_collection(self.collection_name)
                exists = False

            if not exists:
                logger.info(f"Creating collection: {self.collection_name}")
                self.client.create_collection(
                    collection_name=self.collection_name,
                    vectors_config=VectorParams(
                        size=self.config.embedding.dimensions,
                        distance=Distance.COSINE,
                    ),
                )

                # Create text index for hybrid search
                logger.info("Creating text index for full-text search...")
                self.client.create_payload_index(
                    collection_name=self.collection_name,
                    field_name="text",
                    field_schema=PayloadSchemaType.TEXT,
                )

                logger.info(f"Collection created: {self.collection_name}")
            else:
                logger.info(f"Collection already exists: {self.collection_name}")

        except Exception as e:
            logger.error(f"Error creating collection: {e}")
            raise

    def add_documents(
        self, documents: list[CorpusDocument], batch_size: int = 100
    ) -> None:
        """Add documents to the collection in batches"""
        if not documents:
            logger.warning("No documents to add")
            return

        points = []
        for doc in documents:
            if doc.embedding is None:
                logger.warning(f"Document {doc.id} has no embedding, skipping")
                continue

            point = PointStruct(
                id=doc.id,
                vector=doc.embedding,
                payload=cast(
                    dict[str, Any],
                    Document(
                        text=doc.text,
                        metadata=dict(doc.metadata),
                    ),
                ),
            )
            points.append(point)

        if not points:
            return

        # Upload in batches to avoid timeout with large vectors
        total_points = len(points)
        logger.info(f"Uploading {total_points} documents in batches of {batch_size}...")

        for i in range(0, total_points, batch_size):
            batch = points[i : i + batch_size]
            self.client.upsert(
                collection_name=self.collection_name,
                points=batch,
            )
            logger.info(
                f"  Uploaded batch {i // batch_size + 1}/{(total_points + batch_size - 1) // batch_size} ({len(batch)} documents)"
            )

        logger.info(f"✓ Successfully added {total_points} documents to collection")

    def search(
        self,
        query_vector: list[float],
        k: int = 5,
    ) -> list[SearchResult]:
        """Search for similar documents"""
        # Build Qdrant filter
        qdrant_filter = None

        # Execute search
        results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            limit=k,
            query_filter=qdrant_filter,
        ).points

        # Convert to SearchResult objects
        search_results = []
        for result in results:
            if result.payload:
                search_results.append(
                    SearchResult(
                        text=result.payload["text"],
                        metadata=result.payload["metadata"],
                        similarity=result.score,
                        document_id=str(result.id),
                    )
                )

        return search_results

    def hybrid_search(
        self,
        query_text: str,
        query_vector: list[float],
        k: int = 5,
        filters: Optional[SearchFilters] = None,
        semantic_weight: float = 0.7,
    ) -> list[SearchResult]:
        """
        Hybrid search combining semantic similarity and keyword matching.

        Args:
            query_text: Text query for keyword matching
            query_vector: Vector embedding for semantic search
            k: Number of results to return
            filters: Optional filters
            semantic_weight: Weight for semantic score (0-1), keyword weight = 1 - semantic_weight

        Returns:
            Combined and ranked search results
        """
        # Build base filter
        qdrant_filter = None
        if filters:
            conditions: list[Condition] = []

            if filters.source_filter:
                conditions.append(
                    FieldCondition(
                        key="metadata.source",
                        match=MatchAny(any=[s.value for s in filters.source_filter]),
                    )
                )

            if conditions:
                qdrant_filter = Filter(must=conditions)

        # 1. Semantic search
        semantic_results = self.client.query_points(
            collection_name=self.collection_name,
            query=query_vector,
            limit=k * 2,  # Get more results for fusion
            query_filter=qdrant_filter,
        ).points

        # 2. Keyword search using full-text filter
        # Extract individual keywords from query for more lenient matching
        keywords = query_text.lower().split()

        # Try keyword search, but if too few results, fall back to semantic-only
        keyword_results = []

        if len(keywords) > 0:
            keyword_filter_conditions: list[Condition] = []
            if qdrant_filter and qdrant_filter.must:
                if isinstance(qdrant_filter.must, list):
                    keyword_filter_conditions.extend(qdrant_filter.must)
                elif isinstance(qdrant_filter, typing.get_args(Condition)):
                    keyword_filter_conditions.append(qdrant_filter.must)

            # Add text matching condition
            keyword_filter_conditions.append(
                FieldCondition(
                    key="text",
                    match=MatchText(text=query_text),
                )
            )

            keyword_filter = Filter(must=keyword_filter_conditions)

            try:
                # Use semantic search with keyword filter
                keyword_results = self.client.query_points(
                    collection_name=self.collection_name,
                    query=query_vector,
                    limit=k * 2,
                    query_filter=keyword_filter,
                ).points

                # If keyword search returns very few results, it's too restrictive
                if len(keyword_results) < k // 2:
                    logger.debug(
                        f"Keyword search too restrictive ({len(keyword_results)} results), using semantic-only"
                    )
                    keyword_results = []
            except Exception as e:
                logger.debug(
                    f"Keyword search failed, falling back to semantic-only: {e}"
                )
                keyword_results = []

        # 3. Combine results using Reciprocal Rank Fusion (RRF)
        class ResultScore(NamedTuple):
            semantic_score: float
            semantic_rank: Optional[int]
            keyword_rank: Optional[int]
            text: str
            metadata: dict[str, Any]
        result_scores: dict[str, ResultScore] = {}  # document_id -> (semantic_score, keyword_rank, text, metadata)

        # Process semantic results
        for rank, result in enumerate(semantic_results, 1):
            doc_id = str(result.id)
            result_scores[doc_id] = ResultScore(
                semantic_score=result.score,
                semantic_rank=rank,
                keyword_rank=None,
                text=result.payload["text"] if result.payload else "",
                metadata=result.payload["metadata"] if result.payload else {},
            )

        # Process keyword results (if any)
        if keyword_results:
            for rank, result in enumerate(keyword_results, 1):
                doc_id = str(result.id)
                if doc_id in result_scores:
                    result_scores[doc_id] = result_scores[doc_id]._replace(keyword_rank=rank)
                else:
                    result_scores[doc_id] = ResultScore(
                        semantic_score=result.score,
                        semantic_rank=None,
                        keyword_rank=rank,
                        text=result.payload["text"] if result.payload else "",
                        metadata=result.payload["metadata"] if result.payload else {},
                    )

        # Calculate hybrid scores
        final_results = []

        # If no keyword results, just use semantic scores directly
        if not keyword_results:
            for doc_id, info in result_scores.items():
                final_results.append(
                    SearchResult(
                        text=info.text,
                        metadata=info.metadata,
                        similarity=info.semantic_score,  # Use raw semantic score
                        document_id=doc_id,
                    )
                )
        else:
            # Use RRF (Reciprocal Rank Fusion) to combine rankings
            # RRF formula: score = sum(1 / (k + rank)) for each ranking
            # We'll use k=60 as standard in literature
            k_rrf = 60

            for doc_id, info in result_scores.items():
                # Semantic component
                semantic_component: float
                if info.semantic_rank is not None:
                    semantic_component = semantic_weight / (
                        k_rrf + info.semantic_rank
                    )
                else:
                    semantic_component = 0

                # Keyword component
                keyword_component: float
                if info.keyword_rank is not None:
                    keyword_component = (1 - semantic_weight) / (
                        k_rrf + info.keyword_rank
                    )
                else:
                    keyword_component = 0

                hybrid_score = semantic_component + keyword_component

                # Bonus: if document appears in both results, it gets extra points
                if (
                    info.semantic_rank is not None
                    and info.keyword_rank is not None
                ):
                    hybrid_score *= 1.2  # 20% boost for appearing in both

                final_results.append(
                    SearchResult(
                        text=info.text,
                        metadata=info.metadata,
                        similarity=hybrid_score,  # Use hybrid score as similarity
                        document_id=doc_id,
                    )
                )

        # Sort by hybrid score and return top k
        final_results.sort(key=lambda x: x.similarity, reverse=True)

        mode = "semantic-only" if not keyword_results else "hybrid (semantic + keyword)"
        logger.info(
            f"Hybrid search ({mode}): {len(semantic_results)} semantic, "
            f"{len(keyword_results)} keyword, returning {min(len(final_results), k)} results"
        )

        return final_results[:k]

    def get_all_documents(self) -> list[Document]:
        """
        Retrieve all documents from the collection using scroll pagination.

        Returns:
            List of documents
        """
        all_docs = []
        offset = None
        batch_size = 100

        try:
            while True:
                results, next_offset = self.client.scroll(
                    collection_name=self.collection_name,
                    limit=batch_size,
                    offset=offset,
                    with_payload=True,
                    with_vectors=False,
                )

                for point in results:
                    if point.payload:
                        all_docs.append(
                            Document(
                                text=point.payload.get("text", ""),
                                metadata=point.payload.get("metadata", {}),
                            )
                        )

                if next_offset is None:
                    break
                offset = next_offset

            logger.info(
                f"Retrieved {len(all_docs)} documents from {self.collection_name}"
            )
            return all_docs

        except Exception as e:
            logger.error(f"Error retrieving all documents: {e}")
            raise

    def delete_collection(self) -> None:
        """Delete the collection"""
        logger.warning(f"Deleting collection: {self.collection_name}")
        self.client.delete_collection(self.collection_name)

    def close(self) -> None:
        """Close the database connection"""
        # Qdrant client doesn't require explicit closing
        pass
