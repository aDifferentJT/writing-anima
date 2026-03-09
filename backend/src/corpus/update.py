"""Incremental corpus updates"""

import logging
from pathlib import Path
from typing import List, Optional

from .ingest import CorpusIngester
from ..database.schema import SourceType

logger = logging.getLogger(__name__)


class CorpusUpdater:
    """Handle incremental updates to the corpus"""

    def __init__(self, config=None):
        """Initialize corpus updater"""
        self.ingester = CorpusIngester(config)

    def add_file(self, file_path: str, source_type: Optional[SourceType] = None) -> int:
        """
        Add a single file to the corpus.

        Args:
            file_path: Path to file
            source_type: Optional source type

        Returns:
            Number of documents added
        """
        logger.info(f"Adding file to corpus: {file_path}")
        documents = self.ingester.process_file(Path(file_path), source_type)

        if documents:
            # Generate embeddings
            texts = [doc.text for doc in documents]
            embeddings = self.ingester.embedder.generate(texts)

            for doc, embedding in zip(documents, embeddings):
                doc.embedding = embedding

            # Add to database
            self.ingester.db.add_documents(documents)

        logger.info(f"Added {len(documents)} documents from {file_path}")
        return len(documents)

    def add_text(self, text: str, source_type: SourceType = SourceType.NOTE) -> int:
        """
        Add raw text to the corpus.

        Args:
            text: Text to add
            source_type: Source type

        Returns:
            Number of documents added
        """
        return self.ingester.ingest_text(text, source_type)
