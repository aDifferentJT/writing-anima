"""
API boundary types — Pydantic models for all request/response validation.

These are the source of truth for the shape of data crossing the HTTP/WS
boundary. The corresponding frontend types live in frontend/src/apiTypes.ts.
"""

import uuid
from uuid import UUID
from datetime import datetime
from enum import Enum
from typing import Annotated, Any, Optional

from pydantic import BaseModel, Field, TypeAdapter
from sqlalchemy import Column, JSON
from sqlalchemy.types import TypeDecorator
from sqlmodel import Field as SQLField, SQLModel


class PydanticJSON(TypeDecorator[Any]):
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

class Persona(SQLModel, table=True):
    """Persona DB model"""
    id: UUID = SQLField(primary_key=True)
    name: str
    description: Optional[str] = None
    collection_name: str
    model: str = "gpt-5"
    corpus_file_count: int = 0
    chunk_count: int = 0
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

class Purpose(BaseModel):
    """Purpose of a writing project — stored as JSON on Project"""
    topic: str = ""
    context: str = ""


class WritingCriteria(BaseModel):
    """Writing criteria for a project — stored as JSON on Project"""
    criteria: list[str] = []


class ProjectSettings(BaseModel):
    """Project settings — stored as JSON on Project"""
    auto_save_interval: int = 30000
    enable_real_time_sync: bool = True
    other_settings: dict[str, str | int | float | bool | None] = {}


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
    """Request for chatting with a persona"""
    message: Annotated[str, Field(min_length=1)]
    persona_id: str
    conversation_history: list[ChatMessage] = []
    model: str


class ChatResponse(BaseModel):
    """Response from chatting with a persona"""
    response: str
    persona_name: str
    persona_id: str


# ── Analysis ──────────────────────────────────────────────────────────────────

class AnalysisContext(BaseModel):
    """Context sent alongside an analysis request"""
    purpose: Optional[str] = None
    criteria: list[str] = []
    feedback_history: list[ChatMessage] = []


class AnalysisRequest(BaseModel):
    """Request for writing analysis"""
    content: Annotated[str, Field(min_length=1)]
    persona_id: str
    model: str
    context: AnalysisContext
    max_feedback_items: Annotated[int, Field(ge=1, le=50)]


class AnalysisResponse(BaseModel):
    """Response from writing analysis"""
    persona_id: str
    persona_name: str
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


# ── Personas ──────────────────────────────────────────────────────────────────

class PersonaCreate(BaseModel):
    """Request model for creating a persona"""
    name: Annotated[str, Field(min_length=1, max_length=100)]
    description: Annotated[Optional[str], Field(max_length=500)] = None
    model: Annotated[str, Field(description="LLM model ID for this persona")] = "gpt-5"


class PersonaResponse(BaseModel):
    """Flat response model for a persona — all Persona fields plus corpus_available.
    Matches the frontend Persona interface in apiTypes.ts."""
    id: str
    name: str
    description: Optional[str] = None
    model: str
    chunk_count: int
    corpus_available: bool
    created_at: datetime

    @classmethod
    def from_persona(
        cls, persona: Persona, corpus_available: bool = True
    ) -> "PersonaResponse":
        """Create response from Persona model"""
        return cls(
            id=str(persona.id),
            name=persona.name,
            description=persona.description,
            model=persona.model,
            chunk_count=persona.chunk_count,
            corpus_available=corpus_available,
            created_at=persona.created_at,
        )


class PersonaUpdate(BaseModel):
    """Request model for updating a persona"""
    name: Annotated[Optional[str], Field(min_length=1, max_length=100)] = None
    description: Annotated[Optional[str], Field(max_length=500)] = None
    model: Annotated[Optional[str], Field(description="LLM model ID for this persona")] = None


class PersonaList(BaseModel):
    """List of personas"""
    personas: list[PersonaResponse]
    total: int


# ── Available models ──────────────────────────────────────────────────────────

class AvailableModel(BaseModel):
    """Model available for persona selection"""
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
    file_path: str
    filename: str
    chunk_count: int
    chunks: list[CorpusChunk]


class CorpusDocumentsResponse(BaseModel):
    """Response containing all corpus documents for a persona"""
    persona_id: str
    files: list[CorpusFileModel]


class CorpusFile(BaseModel):
    """Corpus file metadata (upload listing)"""
    filename: str
    size: int
    uploaded_at: datetime
    chunk_count: int


class CorpusUploadResponse(BaseModel):
    """Response for corpus upload"""
    persona_id: UUID
    files_uploaded: int
    total_size: int
    message: str


class IngestionStatus(BaseModel):
    """Status of corpus ingestion"""
    persona_id: str
    status: str  # "pending", "processing", "completed", "failed"
    progress: float  # 0.0 to 1.0
    chunks_processed: int
    total_chunks: int
    message: Optional[str] = None


# ── Projects ──────────────────────────────────────────────────────────────────

class Project(SQLModel, table=True):
    """Project DB model"""
    id: UUID = SQLField(default_factory=uuid.uuid4, primary_key=True)
    title: str
    purpose: Purpose = SQLField(sa_column=Column(PydanticJSON(Purpose)))
    content: str
    feedback: list[FeedbackItem] = SQLField(default_factory=list, sa_column=Column(PydanticJSON(list[FeedbackItem])))
    writingCriteria: WritingCriteria = SQLField(default_factory=WritingCriteria, sa_column=Column(PydanticJSON(WritingCriteria)))
    settings: Optional[ProjectSettings] = SQLField(default=None, sa_column=Column(PydanticJSON(Optional[ProjectSettings])))
    created_at: datetime
    updated_at: datetime
    last_accessed_at: datetime
    is_archived: bool

    @classmethod
    def new(
        cls,
        title: str,
        purpose: Purpose,
        content: str,
        feedback: list[FeedbackItem],
        writingCriteria: WritingCriteria,
        settings: Optional[ProjectSettings],
        created_at: datetime,
        updated_at: datetime,
        last_accessed_at: datetime,
        is_archived: bool = False,
    ) -> "Project":
        """Typed constructor — use instead of Project(...) to get mypy checking."""
        return cls(
            title=title,
            purpose=purpose,
            content=content,
            feedback=feedback,
            writingCriteria=writingCriteria,
            settings=settings,
            created_at=created_at,
            updated_at=updated_at,
            last_accessed_at=last_accessed_at,
            is_archived=is_archived,
        )


class ProjectUpdate(BaseModel):
    """Request model for updating a project"""
    title: Optional[str] = None
    purpose: Optional[Purpose] = None
    content: Optional[str] = None
    feedback: Optional[list[FeedbackItem]] = None
    writingCriteria: Optional[WritingCriteria] = None
    settings: Optional[ProjectSettings] = None
    is_archived: Optional[bool] = None


# ── Health ────────────────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    services: dict[str, str]
    version: str = "1.0.0"
