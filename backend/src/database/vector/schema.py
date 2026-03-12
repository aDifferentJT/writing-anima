"""Data models and schema definitions"""

from datetime import datetime
from enum import Enum
from pydantic import BaseModel, Field
from typing import Any, Optional
from uuid import UUID


class SourceType(str, Enum):
    """Source type for corpus documents"""
    EMAIL = "email"
    CHAT = "chat"
    DOCUMENT = "document"
    CODE = "code"
    NOTE = "note"


class CorpusDocumentMetadata(BaseModel):
    source: SourceType
    char_length: int
    filename: str
    chunk_index: int
    total_chunks: int


class CorpusDocument(BaseModel):
    """Document schema for corpus storage"""
    id: UUID
    text: str
    metadata: CorpusDocumentMetadata
    embedding: Optional[list[float]] = None

    @property
    def source(self) -> SourceType:
        """Get source type from metadata"""
        return self.metadata.source

    @property
    def char_length(self) -> int:
        """Get character length"""
        return self.metadata.char_length


class SearchResult(BaseModel):
    """Search result schema"""
    text: str
    metadata: dict[str, Any]
    similarity: float
    document_id: str


class SearchFilters(BaseModel):
    """Filters for search queries"""
    source_filter: Optional[list[SourceType]] = None
