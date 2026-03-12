"""Corpus ingestion pipeline"""

from datetime import datetime
from fastapi import UploadFile
import logging
import os
from pathlib import Path
from tempfile import NamedTemporaryFile
from typing import Optional, Tuple
from uuid import uuid4

from .embed.factory import EmbeddingGeneratorFactory
from .pdf_extractor import PDFExtractor, is_pdf_available
from .mbox_parser import MboxParser
from .claude_parser import ClaudeConversationParser
from ..database.vector import VectorDatabase
from ..database.vector.schema import CorpusDocument, CorpusDocumentMetadata, SourceType
from ..config import Config

logger = logging.getLogger(__name__)


class CorpusIngester:
    """Ingest and process user corpus into vector database"""

    def __init__(self, collection_name: str, config: Config):
        """
        Initialize corpus ingester.

        Args:
            collection_name: Name of the collection to ingest into (e.g., "persona_jules")
            config: Configuration object
        """
        self.config = config
        self.collection_name = collection_name
        self.embedder = EmbeddingGeneratorFactory.create(config)
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

        logger.debug(f"Chunking text: {len(text)} chars, chunk_size={chunk_size}, overlap={overlap}")

        if len(text) <= chunk_size:
            result = [text] if len(text) >= min_length else []
            logger.debug(f"Text smaller than chunk size, returning {len(result)} chunks")
            return result

        chunks = []
        start = 0
        iteration = 0
        max_iterations = 10000  # Safety limit

        while start < len(text):
            iteration += 1
            if iteration > max_iterations:
                logger.error(f"Chunking exceeded max iterations! start={start}, text_len={len(text)}")
                break

            if iteration % 10 == 0:
                logger.debug(f"Chunking iteration {iteration}, start={start}/{len(text)}")

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

        logger.debug(f"Chunking complete: created {len(chunks)} chunks in {iteration} iterations")
        return chunks

    def infer_source_type(self, filename: str) -> SourceType:
        """Infer source type from file path"""
        if "email" in filename:
            return SourceType.EMAIL
        elif "chat" in filename:
            return SourceType.CHAT
        elif "code" in filename or filename.endswith(".py") or filename.endswith(".js") or filename.endswith(".java") or filename.endswith(".cpp"):
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
                        f"Cannot process PDF {filename}: pypdf not installed. "
                        "Install with: pip install pypdf"
                    )
                    return []

                # Extract text from PDF
                text = self.pdf_extractor.extract_text(file)
                if not text:
                    logger.warning(f"No text extracted from PDF: {filename}")
                    return []

            # Check if this is an MBOX file
            elif filename.endswith(".mbox"):
                logger.info(f"Processing MBOX file: {filename}")
                # Parse all emails from mbox
                with NamedTemporaryFile(delete_on_close=False) as tmp:
                    tmp.write(await file.read())
                    text = self.mbox_parser.parse_mbox(tmp.name)
                if not text:
                    logger.warning(f"No emails extracted from MBOX: {filename}")
                    return []

            # Check if this is a Claude conversation JSON file
            elif filename.endswith(".json") and "chat" in filename.lower():
                logger.info(f"Processing Claude conversation JSON: {filename}")
                # Parse conversations from JSON
                text = self.claude_parser.parse_to_text(file)
                if not text:
                    logger.warning(f"No conversations extracted from JSON: {filename}")
                    return []

            else:
                # Read regular text file
                content: bytes = await file.read()
                text = content.decode("utf-8")

            if not text.strip():
                logger.warning(f"Empty file: {filename}")
                return []

            # Chunk text
            logger.debug(f"Chunking text ({len(text)} characters)...")
            chunks = self.chunk_text(text)
            logger.info(f"  → Created {len(chunks)} chunks from {filename}")

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
            logger.error(f"Error processing file {filename}: {e}")
            return []

    async def ingest_file(self, file: UploadFile, source_type: Optional[SourceType] = None) -> int:
        """
        Ingest a single file into the corpus.

        Args:
            file: The file to ingest
            source_type: Optional source type (auto-detected if None)

        Returns:
            Number of documents created
        """
        logger.info(f"Ingesting file: {file.filename}")

        # Process the file to create documents
        documents = await self.process_file(file, source_type)

        if not documents:
            logger.warning(f"No documents created from file: {file.filename}")
            return 0

        logger.info(f"Created {len(documents)} document chunks from {file.filename}")

        # Generate embeddings
        texts = [doc.text for doc in documents]
        logger.info(f"Generating embeddings for {len(texts)} chunks...")
        embeddings = self.embedder.generate(texts)

        # Assign embeddings to documents
        for doc, embedding in zip(documents, embeddings):
            doc.embedding = embedding

        # Add to database
        logger.info(f"Adding {len(documents)} documents to vector database...")
        self.db.add_documents(documents)

        logger.info(f"✓ Successfully ingested {len(documents)} documents from {file.filename}")
        return len(documents)
