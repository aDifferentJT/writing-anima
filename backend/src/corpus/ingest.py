"""Corpus ingestion pipeline"""

import asyncio
import logging
from collections.abc import Callable
from tempfile import NamedTemporaryFile
from typing import Literal, Optional
from uuid import uuid4

from fastapi import UploadFile

from .embed.base import BaseEmbeddingGenerator
from .pdf_extractor import PDFExtractor, is_pdf_available
from .mbox_parser import MboxParser
from .claude_parser import ClaudeConversationParser
from ..database.vector import VectorDatabase
from ..database.vector.schema import CorpusDocument, CorpusDocumentMetadata, SourceType
from ..config import Config

logger = logging.getLogger(__name__)


Stage = Literal["Extracting text"] | Literal["Generating embeddings"] | Literal["Storing documents"]
STAGES: list[Stage] = ["Extracting text", "Generating embeddings", "Storing documents"]


class CorpusIngester:
    """Ingest and process user corpus into vector database"""

    def __init__(self, collection_name: str, config: Config, embedder: BaseEmbeddingGenerator):
        """
        Initialize corpus ingester.

        Args:
            collection_name: Name of the collection to ingest into (e.g., "anima_jules")
            config: Configuration object
            embedder: Pre-constructed embedding generator
        """
        self.config = config
        self.collection_name = collection_name
        self.embedder = embedder
        self.db = VectorDatabase(collection_name, config)

        # Initialize PDF extractor if available
        self.pdf_extractor = None
        if is_pdf_available():
            try:
                self.pdf_extractor = PDFExtractor()
                logger.info("PDF support enabled")
            except ImportError:
                logger.warning("PDF support disabled (pypdf not installed)")
        else:
            logger.warning("PDF support disabled (pypdf not installed)")

        # Initialize MBOX parser (always available - uses stdlib)
        self.mbox_parser = MboxParser()
        logger.info("MBOX email support enabled")

        # Initialize Claude conversation parser (always available - uses stdlib)
        self.claude_parser = ClaudeConversationParser()
        logger.info("Claude conversation JSON support enabled")

    def chunk_text(self, text: str) -> list[str]:
        """
        Chunk text into overlapping segments.

        Args:
            text: Text to chunk

        Returns:
            List of text chunks
        """
        chunk_size = self.config.corpus.chunk_size
        overlap = self.config.corpus.chunk_overlap
        min_length = self.config.corpus.min_chunk_length

        logger.debug(
            "Chunking text: %d chars, chunk_size=%d, overlap=%d",
            len(text), chunk_size, overlap
        )

        if len(text) <= chunk_size:
            result = [text] if len(text) >= min_length else []
            logger.debug("Text smaller than chunk size, returning %d chunks", len(result))
            return result

        chunks = []
        start = 0
        iteration = 0
        max_iterations = 10000  # Safety limit

        while start < len(text):
            iteration += 1
            if iteration > max_iterations:
                logger.error(
                    "Chunking exceeded max iterations! start=%d, text_len=%d",
                    start, len(text)
                )
                break

            if iteration % 10 == 0:
                logger.debug("Chunking iteration %d, start=%d/%d", iteration, start, len(text))

            end = start + chunk_size

            # Try to break at sentence boundary
            if end < len(text):
                # Look for sentence endings
                for sep in [". ", ".\n", "! ", "!\n", "? ", "?\n"]:
                    last_sep = text[start:end].rfind(sep)
                    if last_sep != -1:
                        end = start + last_sep + len(sep)
                        break

            chunk = text[start:end].strip()

            # Only add chunks that meet minimum length
            if len(chunk) >= min_length:
                chunks.append(chunk)

            # Move start position with overlap
            # Ensure we always make progress forward
            if end >= len(text):
                # We're at the end
                start = len(text)
            else:
                # Move forward by at least chunk_size - overlap
                start = max(start + 1, end - overlap)

        logger.debug(
            "Chunking complete: created %d chunks in %d iterations",
            len(chunks), iteration
        )
        return chunks

    def infer_source_type(self, filename: str) -> SourceType:
        """Infer source type from file path"""
        if "email" in filename:
            return SourceType.EMAIL
        elif "chat" in filename:
            return SourceType.CHAT
        elif (
            "code" in filename
            or filename.endswith(".py")
            or filename.endswith(".js")
            or filename.endswith(".java")
            or filename.endswith(".cpp")
        ):
            return SourceType.CODE
        elif "note" in filename:
            return SourceType.NOTE
        else:
            return SourceType.DOCUMENT

    async def process_file(
        self, file: UploadFile, source_type: Optional[SourceType] = None
    ) -> list[CorpusDocument]:
        """
        Process a single file and create corpus documents.

        Args:
            file: File
            source_type: Optional source type (auto-detected if None)

        Returns:
            List of CorpusDocument objects
        """
        try:
            filename = file.filename or ""

            # Check if this is a PDF file
            if filename.endswith(".pdf"):
                if self.pdf_extractor is None:
                    logger.error(
                        "Cannot process PDF %s: pypdf not installed. "
                        "Install with: pip install pypdf", filename
                    )
                    return []

                # Extract text from PDF
                text = self.pdf_extractor.extract_text(file)
                if not text:
                    logger.warning("No text extracted from PDF: %s", filename)
                    return []

            # Check if this is an MBOX file
            elif filename.endswith(".mbox"):
                logger.info("Processing MBOX file: %s", filename)
                # Parse all emails from mbox
                with NamedTemporaryFile(delete_on_close=False) as tmp:
                    tmp.write(await file.read())
                    text = self.mbox_parser.parse_mbox(tmp.name)
                if not text:
                    logger.warning("No emails extracted from MBOX: %s", filename)
                    return []

            # Check if this is a Claude conversation JSON file
            elif filename.endswith(".json") and "chat" in filename.lower():
                logger.info("Processing Claude conversation JSON: %s", filename)
                # Parse conversations from JSON
                text = self.claude_parser.parse_to_text(file)
                if not text:
                    logger.warning("No conversations extracted from JSON: %s", filename)
                    return []

            else:
                # Read regular text file
                content: bytes = await file.read()
                text = content.decode("utf-8")

            if not text.strip():
                logger.warning("Empty file: %s", filename)
                return []

            # Chunk text
            logger.debug("Chunking text (%d characters)...", len(text))
            chunks = self.chunk_text(text)
            logger.info("  → Created %d chunks from %s", len(chunks), filename)

            # Infer source type if not provided
            if source_type is None:
                source_type = self.infer_source_type(filename)

            # Create documents
            documents = []
            for i, chunk in enumerate(chunks):
                doc = CorpusDocument(
                    id=uuid4(),
                    text=chunk,
                    metadata=CorpusDocumentMetadata(
                        source=source_type,
                        char_length=len(chunk),
                        filename=filename,
                        chunk_index=i,
                        total_chunks=len(chunks),
                    ),
                )
                documents.append(doc)

            return documents

        except Exception as e:
            logger.error("Error processing file %s: %s", filename, e)
            return []

    async def ingest(
        self,
        file: UploadFile,
        source_type: Optional[SourceType] = None,
        progress_callback: Callable[[Stage, float | None], None] | None = None,
    ) -> int:
        """
        Ingest a single file into the corpus.

        Calls progress_callback(stage, step_progress) at each stage. Returns chunks added.
        """
        def _notify(stage: Stage, step_progress: float | None = None) -> None:
            if progress_callback:
                progress_callback(stage, step_progress)

        logger.info("Ingesting file: %s", file.filename)

        _notify("Extracting text")
        documents = await self.process_file(file, source_type)

        if not documents:
            logger.warning("No documents created from file: %s", file.filename)
            return 0

        logger.info("Created %d document chunks from %s", len(documents), file.filename)

        _notify("Generating embeddings", 0)
        batch_size = self.embedder.batch_size
        total_batches = (len(documents) + batch_size - 1) // batch_size
        logger.info("Generating embeddings: %d chunks in %d batches (batch_size=%d)", len(documents), total_batches, batch_size)
        for batch_num, i in enumerate(range(0, len(documents), batch_size), 1):
            batch = documents[i : i + batch_size]
            texts = [d.text for d in batch]
            logger.info("Embedding batch %d/%d (%d texts)...", batch_num, total_batches, len(texts))
            embeddings = await asyncio.to_thread(self.embedder.generate_batch, texts, batch_num)
            logger.info("Batch %d/%d done (%d embeddings returned)", batch_num, total_batches, len(embeddings))
            for doc, embedding in zip(batch, embeddings):
                doc.embedding = embedding
            _notify("Generating embeddings", batch_num / total_batches)

        _notify("Storing documents", 0)
        logger.info("Adding %d documents to vector database...", len(documents))
        self.db.add_documents(
            documents,
            progress_callback=lambda p: _notify("Storing documents", p),
        )
        logger.info("Vector database insert complete")

        logger.info("✓ Successfully ingested %d documents from %s", len(documents), file.filename)
        return len(documents)
