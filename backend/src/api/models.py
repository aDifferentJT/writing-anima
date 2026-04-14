"""
API boundary types — Pydantic models for all request/response validation.

These are the source of truth for the shape of data crossing the HTTP/WS
boundary. The corresponding frontend types live in frontend/src/apiTypes.ts.
"""

import uuid
from uuid import UUID
from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Literal, Optional, Union

from pydantic import BaseModel, Field, TypeAdapter
from sqlalchemy import Column, JSON, String
from sqlalchemy.types import TypeDecorator
from sqlmodel import Field as SQLField, SQLModel


class UUIDString(TypeDecorator[UUID]):  # pylint: disable=abstract-method,too-many-ancestors
    """SQLAlchemy column type that stores UUID as string (for SQLite compatibility)."""
    impl = String
    cache_ok = True

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        return str(value)

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        return UUID(value)


class PydanticJSON(TypeDecorator[Any]):  # pylint: disable=abstract-method,too-many-ancestors
    """SQLAlchemy column type that serializes any Pydantic type to/from JSON."""
    impl = JSON
    cache_ok = True

    def __init__(self, annotation: Any) -> None:
        super().__init__()
        self._adapter: TypeAdapter[Any] = TypeAdapter(annotation)

    def process_bind_param(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        return self._adapter.dump_python(value, mode='json')

    def process_result_value(self, value: Any, dialect: Any) -> Any:
        if value is None:
            return None
        return self._adapter.validate_python(value)


# ── Database models ───────────────────────────────────────────────────────────
# Defined here so the API surface and DB schema are in one place.
# database/general/__init__.py re-exports these and owns the engine.

class StylePackItem(BaseModel):
    """A single style-grounding sample stored on an Anima"""
    text: str
    filename: str


class Anima(SQLModel, table=True):
    """Anima DB model"""
    id: UUID = SQLField(default_factory=uuid.uuid4, sa_column=Column(UUIDString, primary_key=True))
    name: str
    description: Optional[str] = None
    collection_name: str
    corpus_file_count: int = 0
    chunk_count: int = 0
    embedding_provider: str
    style_pack: list[StylePackItem] = SQLField(
        default_factory=list, sa_column=Column(PydanticJSON(list[StylePackItem]))
    )
    created_at: datetime
    updated_at: datetime


# ── Enums ─────────────────────────────────────────────────────────────────────

class FeedbackType(str, Enum):
    """Types of feedback items"""

    SUGGESTION = "suggestion"
    ISSUE = "issue"
    PRAISE = "praise"
    QUESTION = "question"


class FeedbackSeverity(str, Enum):
    """Severity levels for feedback items"""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


# ── Shared sub-types ──────────────────────────────────────────────────────────

class WritingCriteria(BaseModel):
    """Writing criteria for a project — stored as JSON on Project"""
    criteria: list[str] = []


class TextPosition(BaseModel):
    """Position of a text span for highlighting"""
    start: int
    end: int
    text: str


class CorpusSource(BaseModel):
    """A source passage from the corpus that grounds feedback"""
    text: str
    source_file: Optional[str] = None
    relevance: Optional[str] = None


# ── Feedback ──────────────────────────────────────────────────────────────────

class FeedbackItem(BaseModel):
    """Single feedback item — sent by the backend over the analysis WebSocket"""
    id: str
    type: FeedbackType
    category: str
    title: str
    content: str
    severity: FeedbackSeverity
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]
    sources: list[str]
    corpus_sources: list[CorpusSource]
    positions: list[TextPosition]
    model: str


# ── Chat ──────────────────────────────────────────────────────────────────────

class ChatMessage(BaseModel):
    """A single message in a conversation — role is 'user' or 'assistant'"""
    role: str
    content: str


class ChatRequest(BaseModel):
    """Request for chatting with an anima"""
    message: Annotated[str, Field(min_length=1)]
    anima_id: str
    conversation_history: list[ChatMessage] = []
    model: str


class ChatResponse(BaseModel):
    """Response from chatting with an anima"""
    response: str
    anima_name: str
    anima_id: str


# ── Analysis ──────────────────────────────────────────────────────────────────

class AnalysisContext(BaseModel):
    """Context sent alongside an analysis request"""
    purpose: Optional[str] = None
    criteria: list[str] = []


class AnalysisRequest(BaseModel):
    """Request for writing analysis"""
    content: Annotated[str, Field(min_length=1)]
    anima_id: str
    model: str
    context: AnalysisContext


class AnalysisResponse(BaseModel):
    """Response from writing analysis"""
    anima_id: str
    anima_name: str
    feedback: list[FeedbackItem]
    processing_time: float


# ── Streaming ─────────────────────────────────────────────────────────────────

class StreamStatus(BaseModel):
    """Status update during streaming"""
    message: str
    progress: float
    tool: Optional[str] = None
    type: str = "status"


class StreamFeedback(BaseModel):
    """Feedback item pushed during streaming"""
    item: FeedbackItem
    type: str = "feedback"


class StreamComplete(BaseModel):
    """Completion message for streaming"""
    total_items: int
    processing_time: float
    type: str = "complete"


# ── Animas ────────────────────────────────────────────────────────────────────

class AnimaCreate(BaseModel):
    """Request model for creating an anima"""
    name: Annotated[str, Field(min_length=1, max_length=100)]
    description: Annotated[Optional[str], Field(max_length=500)] = None
    embedding_provider: str


class AnimaResponse(BaseModel):
    """Flat response model for an anima — all Anima fields plus corpus_available.
    Matches the frontend Anima interface in apiTypes.ts."""
    id: UUID
    name: str
    description: Optional[str] = None
    chunk_count: int
    corpus_available: bool
    embedding_provider: str
    created_at: datetime

    @classmethod
    def from_anima(
        cls, anima: "Anima", corpus_available: bool = True
    ) -> "AnimaResponse":
        """Create response from Anima model"""
        return cls(
            id=anima.id,
            name=anima.name,
            description=anima.description,
            chunk_count=anima.chunk_count,
            corpus_available=corpus_available,
            embedding_provider=anima.embedding_provider,
            created_at=anima.created_at,
        )


class AnimaUpdate(BaseModel):
    """Request model for updating an anima"""
    name: Annotated[Optional[str], Field(min_length=1, max_length=100)] = None
    description: Annotated[Optional[str], Field(max_length=500)] = None
    model: Annotated[Optional[str], Field(description="LLM model ID for this anima")] = None


class AnimaList(BaseModel):
    """List of animas"""
    animas: list[AnimaResponse]
    total: int


# ── Available embedding providers ─────────────────────────────────────────────

class EmbeddingProviderInfo(BaseModel):
    """An available embedding provider"""
    id: str
    name: str
    provider: str


class EmbeddingProvidersResponse(BaseModel):
    """Response containing available embedding providers"""
    providers: list[EmbeddingProviderInfo]


# ── Available models ──────────────────────────────────────────────────────────

class AvailableModel(BaseModel):
    """Model available for anima selection"""
    id: str
    name: str
    provider: str
    description: str


class AvailableModelsResponse(BaseModel):
    """Response containing available models"""
    models: list[AvailableModel]


# ── Corpus ────────────────────────────────────────────────────────────────────

class CorpusChunk(BaseModel):
    """A single chunk from a corpus document"""
    text: str
    chunk_index: int
    char_length: int


class CorpusFileModel(BaseModel):
    """A corpus file reconstructed from its chunks"""
    filename: str
    chunk_count: int
    chunks: list[CorpusChunk]


class CorpusDocumentsResponse(BaseModel):
    """Response containing all corpus documents for an anima"""
    anima_id: UUID
    files: list[CorpusFileModel]


class CorpusFile(BaseModel):
    """Corpus file metadata (upload listing)"""
    filename: str
    size: int
    uploaded_at: datetime
    chunk_count: int


class CorpusUploadFile(BaseModel):
    """A single file in a corpus upload request"""
    name: str
    size: int
    content: str  # base64-encoded


class CorpusUploadRequest(BaseModel):
    """Request payload for corpus upload WebSocket"""
    files: list[CorpusUploadFile]


class CorpusStatusMessage(BaseModel):
    """WebSocket message: corpus ingestion progress update"""
    type: Literal["status"] = "status"
    steps_completed: list[str]
    steps_remaining: list[str]
    current_step: str
    step_progress: Optional[float]  # 0.0–1.0, or None if unavailable


class CorpusCompleteMessage(BaseModel):
    """WebSocket message: corpus ingestion finished successfully"""
    type: Literal["complete"] = "complete"
    files_uploaded: int
    total_size: int
    message: str


class CorpusErrorMessage(BaseModel):
    """WebSocket message: corpus ingestion failed"""
    type: Literal["error"] = "error"
    message: str


CorpusUploadMessage = Union[CorpusStatusMessage, CorpusCompleteMessage, CorpusErrorMessage]


class IngestionStatus(BaseModel):
    """Status of corpus ingestion"""
    anima_id: str
    status: str  # "pending", "processing", "completed", "failed"
    progress: float  # 0.0 to 1.0
    chunks_processed: int
    total_chunks: int
    message: Optional[str] = None


# ── Projects ──────────────────────────────────────────────────────────────────

class ProjectSettings(BaseModel):
    """Project settings — stored as JSON on Project"""
    favourite_animas: list[str] = Field(default_factory=list)
    default_anima_id: Optional[str] = None
    default_model_id: Optional[str] = None


class Project(SQLModel, table=True):
    """Project DB model"""
    id: UUID = SQLField(default_factory=uuid.uuid4, sa_column=Column(UUIDString, primary_key=True))
    title: str
    description: str = ""
    content: str
    feedback: list[FeedbackItem] = SQLField(
        default_factory=list, sa_column=Column(PydanticJSON(list[FeedbackItem]))
    )
    writing_criteria: WritingCriteria = SQLField(
        default_factory=WritingCriteria, sa_column=Column(PydanticJSON(WritingCriteria))
    )
    settings: ProjectSettings = SQLField(
        default_factory=ProjectSettings, sa_column=Column(PydanticJSON(ProjectSettings))
    )
    created_at: datetime
    updated_at: datetime
    last_accessed_at: datetime
    is_archived: bool

    @classmethod
    def new(  # pylint: disable=too-many-arguments,too-many-positional-arguments
        cls,
        title: str,
        description: str,
        content: str,
        feedback: list[FeedbackItem],
        writing_criteria: WritingCriteria,
        settings: ProjectSettings,
        created_at: datetime,
        updated_at: datetime,
        last_accessed_at: datetime,
        is_archived: bool = False,
    ) -> "Project":
        """Typed constructor — use instead of Project(...) to get mypy checking."""
        return cls(
            title=title,
            description=description,
            content=content,
            feedback=feedback,
            writing_criteria=writing_criteria,
            settings=settings,
            created_at=created_at,
            updated_at=updated_at,
            last_accessed_at=last_accessed_at,
            is_archived=is_archived,
        )


class ProjectUpdate(BaseModel):
    """Request model for updating a project"""
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    feedback: Optional[list[FeedbackItem]] = None
    writing_criteria: Optional[WritingCriteria] = None
    settings: Optional[ProjectSettings] = None  # None means "don't update settings"
    is_archived: Optional[bool] = None


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    services: dict[str, str]
    version: str = "1.0.0"
