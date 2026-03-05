"""Corpus ingestion pipeline"""

import os
import logging
from pathlib import Path
from typing import List, Optional, Tuple, Dict
from datetime import datetime
from uuid import uuid4

from .embed.factory import EmbeddingGeneratorFactory
from .pdf_extractor import PDFExtractor, is_pdf_available
from .mbox_parser import MboxParser
from .claude_parser import ClaudeConversationParser
from ..database.vector_db import VectorDatabase
from ..database.schema import CorpusDocument, SourceType
from ..config import get_config

logger = logging.getLogger(__name__)


class CorpusIngester:
    """Ingest and process user corpus into vector database"""

    def __init__(self, collection_name: str, config=None):
        """
        Initialize corpus ingester.

        Args:
            collection_name: Name of the collection to ingest into (e.g., "persona_jules")
            config: Optional configuration object
        """
        if config is None:
            config = get_config()

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

    def chunk_text(self, text: str) -> List[str]:
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

    def infer_source_type(self, file_path: Path) -> SourceType:
        """Infer source type from file path"""
        path_str = str(file_path).lower()

        if "email" in path_str:
            return SourceType.EMAIL
        elif "chat" in path_str:
            return SourceType.CHAT
        elif "code" in path_str or file_path.suffix in [".py", ".js", ".java", ".cpp"]:
            return SourceType.CODE
        elif "note" in path_str:
            return SourceType.NOTE
        else:
            return SourceType.DOCUMENT

    def process_file(
        self, file_path: Path, source_type: Optional[SourceType] = None
    ) -> List[CorpusDocument]:
        """
        Process a single file and create corpus documents.

        Args:
            file_path: Path to file
            source_type: Optional source type (auto-detected if None)

        Returns:
            List of CorpusDocument objects
        """
        try:
            # Check if this is a PDF file
            if file_path.suffix.lower() == ".pdf":
                if self.pdf_extractor is None:
                    logger.error(
                        f"Cannot process PDF {file_path}: pypdf not installed. "
                        "Install with: pip install pypdf"
                    )
                    return []

                # Extract text from PDF
                text = self.pdf_extractor.extract_text(file_path)
                if not text:
                    logger.warning(f"No text extracted from PDF: {file_path}")
                    return []

            # Check if this is an MBOX file
            elif file_path.suffix.lower() == ".mbox":
                logger.info(f"Processing MBOX file: {file_path}")
                # Parse all emails from mbox
                text = self.mbox_parser.parse_mbox_to_text(file_path)
                if not text:
                    logger.warning(f"No emails extracted from MBOX: {file_path}")
                    return []

            # Check if this is a Claude conversation JSON file
            elif file_path.suffix.lower() == ".json" and "chat" in str(file_path).lower():
                logger.info(f"Processing Claude conversation JSON: {file_path}")
                # Parse conversations from JSON
                text = self.claude_parser.parse_to_text(file_path)
                if not text:
                    logger.warning(f"No conversations extracted from JSON: {file_path}")
                    return []

            else:
                # Read regular text file
                with open(file_path, "r", encoding="utf-8") as f:
                    text = f.read()

            if not text.strip():
                logger.warning(f"Empty file: {file_path}")
                return []

            # Chunk text
            logger.debug(f"Chunking text ({len(text)} characters)...")
            chunks = self.chunk_text(text)
            logger.info(f"  → Created {len(chunks)} chunks from {file_path.name}")

            # Infer source type if not provided
            if source_type is None:
                source_type = self.infer_source_type(file_path)

            # Get file timestamp
            timestamp = datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()

            # Create documents
            documents = []
            for i, chunk in enumerate(chunks):
                doc = CorpusDocument(
                    id=str(uuid4()),
                    text=chunk,
                    metadata={
                        "timestamp": timestamp,
                        "source": source_type.value,
                        "char_length": len(chunk),
                        "file_path": str(file_path),
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                    },
                )
                documents.append(doc)

            return documents

        except Exception as e:
            logger.error(f"Error processing file {file_path}: {e}")
            return []

    def get_ingested_files(self) -> Dict[str, str]:
        """
        Get map of already ingested files and their modification times.

        Returns:
            Dict mapping file_path -> timestamp
        """
        try:
            # Scroll through all documents to find unique files
            from qdrant_client.http.models import ScrollRequest

            files = {}
            offset = None

            while True:
                results = self.db.client.scroll(
                    collection_name=self.db.collection_name,
                    limit=100,
                    offset=offset,
                    with_payload=True,
                    with_vectors=False,
                )

                if not results[0]:  # No more results
                    break

                for point in results[0]:
                    if point.payload and "metadata" in point.payload:
                        metadata = point.payload["metadata"]
                        file_path = metadata.get("file_path")
                        timestamp = metadata.get("timestamp")
                        if file_path and timestamp:
                            files[file_path] = timestamp

                offset = results[1]  # Next offset
                if offset is None:
                    break

            return files
        except Exception as e:
            logger.warning(f"Could not get ingested files: {e}")
            return {}

    def ingest_directory(
        self, directory: str, recursive: bool = True, force_recreate: bool = False, incremental: bool = True
    ) -> int:
        """
        Ingest all files from a directory.

        Args:
            directory: Directory path
            recursive: Whether to search recursively
            force_recreate: Whether to recreate the collection
            incremental: Only process new/modified files (default: True)

        Returns:
            Number of documents ingested
        """
        dir_path = Path(directory)
        if not dir_path.exists():
            raise ValueError(f"Directory does not exist: {directory}")

        # Create collection
        self.db.create_collection(force=force_recreate)

        # Get already ingested files if doing incremental
        ingested_files = {}
        if incremental and not force_recreate:
            logger.info("Checking for already ingested files...")
            ingested_files = self.get_ingested_files()
            logger.info(f"Found {len(ingested_files)} unique files already ingested")

        # Find all matching files
        all_documents = []
        skipped_count = 0

        if recursive:
            pattern = "**/*"
        else:
            pattern = "*"

        for file_type in self.config.corpus.file_types:
            for file_path in dir_path.glob(f"{pattern}{file_type}"):
                if file_path.is_file():
                    file_path_str = str(file_path)

                    # Check if file was already ingested and hasn't changed
                    if incremental and file_path_str in ingested_files:
                        file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()
                        if file_mtime == ingested_files[file_path_str]:
                            logger.debug(f"Skipping unchanged file: {file_path.name}")
                            skipped_count += 1
                            continue
                        else:
                            logger.info(f"File modified, reprocessing: {file_path.name}")

                    logger.info(f"Processing: {file_path}")
                    docs = self.process_file(file_path)
                    all_documents.extend(docs)

        if skipped_count > 0:
            logger.info(f"Skipped {skipped_count} unchanged files")

        if not all_documents:
            logger.warning("No new documents to ingest")
            return 0

        logger.info(f"✓ Processed {len(all_documents)} document chunks from new/modified files")
        logger.info(f"  Total characters: {sum(len(doc.text) for doc in all_documents):,}")

        # Generate embeddings
        logger.info("=" * 60)
        logger.info("STEP: Generating embeddings via OpenAI API...")
        logger.info("=" * 60)
        texts = [doc.text for doc in all_documents]
        logger.info(f"Preparing to embed {len(texts)} text chunks...")

        embeddings = self.embedder.generate(texts)

        logger.info("=" * 60)
        logger.info("✓ Embedding generation complete!")
        logger.info("=" * 60)

        # Assign embeddings to documents
        logger.info("Assigning embeddings to documents...")
        for doc, embedding in zip(all_documents, embeddings):
            doc.embedding = embedding
        logger.info("✓ Embeddings assigned")

        # Add to database
        logger.info("=" * 60)
        logger.info("STEP: Adding documents to vector database...")
        logger.info("=" * 60)
        self.db.add_documents(all_documents)
        logger.info("✓ Documents added to database")

        logger.info("=" * 60)
        logger.info(f"✓✓✓ Successfully ingested {len(all_documents)} documents!")
        logger.info("=" * 60)
        return len(all_documents)

    def ingest_file(self, file_path: str, source_type: Optional[SourceType] = None) -> int:
        """
        Ingest a single file into the corpus.

        Args:
            file_path: Path to the file to ingest
            source_type: Optional source type (auto-detected if None)

        Returns:
            Number of documents created
        """
        from pathlib import Path

        path = Path(file_path)
        if not path.exists():
            raise ValueError(f"File does not exist: {file_path}")

        logger.info(f"Ingesting file: {path}")

        # Process the file to create documents
        documents = self.process_file(path, source_type)

        if not documents:
            logger.warning(f"No documents created from file: {file_path}")
            return 0

        logger.info(f"Created {len(documents)} document chunks from {path.name}")

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

        logger.info(f"✓ Successfully ingested {len(documents)} documents from {path.name}")
        return len(documents)

    def ingest_text(
        self, text: str, source_type: SourceType = SourceType.NOTE
    ) -> int:
        """
        Ingest raw text directly.

        Args:
            text: Text to ingest
            source_type: Source type for the text

        Returns:
            Number of documents created
        """
        # Chunk text
        chunks = self.chunk_text(text)
        if not chunks:
            logger.warning("No chunks created from text")
            return 0

        # Create documents
        timestamp = datetime.now().isoformat()
        documents = []

        for i, chunk in enumerate(chunks):
            doc = CorpusDocument(
                id=str(uuid4()),
                text=chunk,
                metadata={
                    "timestamp": timestamp,
                    "source": source_type.value,
                    "char_length": len(chunk),
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            )
            documents.append(doc)

        # Generate embeddings
        texts = [doc.text for doc in documents]
        embeddings = self.embedder.generate(texts)

        for doc, embedding in zip(documents, embeddings):
            doc.embedding = embedding

        # Add to database
        self.db.add_documents(documents)

        logger.info(f"Ingested {len(documents)} documents from text")
        return len(documents)
