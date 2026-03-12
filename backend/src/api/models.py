"""
Pydantic models for API request/response validation
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from ..database.general import Persona


class FeedbackType(str, Enum):
    """Types of feedback"""

    SUGGESTION = "suggestion"
    ISSUE = "issue"
    PRAISE = "praise"
    QUESTION = "question"


class FeedbackSeverity(str, Enum):
    """Severity levels for feedback"""

    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


# Persona Models
class PersonaCreate(BaseModel):
    """Request model for creating a persona"""

    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    model: str = Field(default="gpt-5", description="LLM model ID for this persona")


class PersonaResponse(BaseModel):
    """Response model for persona"""

    persona: Persona
    corpus_available: bool = True  # Whether the Qdrant collection exists


class PersonaUpdate(BaseModel):
    """Request model for updating a persona"""

    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    model: Optional[str] = Field(None, description="LLM model ID for this persona")


class AvailableModel(BaseModel):
    """Model available for selection"""

    id: str
    name: str
    provider: str
    description: str


class AvailableModelsResponse(BaseModel):
    """Response containing available models"""

    models: list[AvailableModel]


class PersonaList(BaseModel):
    """List of personas"""

    personas: list[PersonaResponse]
    total: int


# Corpus Models
class CorpusFile(BaseModel):
    """Corpus file metadata"""

    filename: str
    size: int
    uploaded_at: datetime
    chunk_count: int


class CorpusUploadResponse(BaseModel):
    """Response for corpus upload"""

    persona_id: str
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
    message: Optional[str]


# Analysis Models
class AnalysisContext(BaseModel):
    """Context for writing analysis"""

    purpose: Optional[str] = None
    criteria: list[str] = Field(default_factory=list)
    feedback_history: list[dict[str, Any]] = Field(default_factory=list)


class AnalysisRequest(BaseModel):
    """Request for writing analysis"""

    content: str = Field(..., min_length=1)
    persona_id: str
    model: str
    context: AnalysisContext
    max_feedback_items: int = Field(ge=1, le=50)


class TextPosition(BaseModel):
    """Position information for text highlighting"""

    start: int  # Start character index
    end: int  # End character index
    text: str  # The actual text being referenced


class CorpusSource(BaseModel):
    """A source passage from the corpus that grounds feedback"""

    text: str  # The actual text from the corpus
    source_file: Optional[str] = None  # Source file name
    relevance: Optional[str] = None  # Why this source is relevant


class FeedbackItem(BaseModel):
    """Single feedback item"""

    id: str
    type: FeedbackType
    category: str
    title: str
    content: str
    severity: FeedbackSeverity
    confidence: float = Field(..., ge=0.0, le=1.0)
    sources: list[str] = Field(default_factory=list)  # Corpus chunk IDs (deprecated)
    corpus_sources: list[CorpusSource] = Field(
        default_factory=list
    )  # Actual corpus passages
    position: Optional[int] = None  # Deprecated: use positions instead
    positions: list[TextPosition] = Field(
        default_factory=list
    )  # Text positions for highlighting
    model: Optional[str] = (
        None  # Model that generated this feedback (e.g., "gpt-5", "kimi-k2")
    )


class AnalysisResponse(BaseModel):
    """Response from writing analysis"""

    persona_id: str
    persona_name: str
    feedback: list[FeedbackItem]
    metadata: dict[str, Any] = Field(default_factory=dict)
    processing_time: float


# Streaming Models
class StreamStatus(BaseModel):
    """Status update during streaming"""

    type: str = "status"
    message: str
    tool: Optional[str] = None
    progress: Optional[float] = None


class StreamFeedback(BaseModel):
    """Feedback chunk during streaming"""

    type: str = "feedback"
    item: FeedbackItem


class StreamComplete(BaseModel):
    """Completion message for streaming"""

    type: str = "complete"
    total_items: int
    processing_time: float


# Corpus Document Models
class CorpusChunk(BaseModel):
    """A single chunk from a corpus document"""

    text: str
    chunk_index: int
    char_length: int


class CorpusFileModel(BaseModel):
    """A corpus file reconstructed from chunks"""

    file_path: str
    filename: str
    chunk_count: int
    chunks: list[CorpusChunk]


class CorpusDocumentsResponse(BaseModel):
    """Response containing all corpus documents for a persona"""

    persona_id: str
    files: list[CorpusFileModel]


# Chat Models
class ChatMessage(BaseModel):
    """A single message in a chat conversation"""

    role: str = Field(..., description="'user' or 'assistant'")
    content: str


class ChatRequest(BaseModel):
    """Request for chatting with a persona"""

    message: str = Field(..., min_length=1)
    persona_id: str
    conversation_history: list[ChatMessage] = Field(default_factory=list)
    model: str


class ChatResponse(BaseModel):
    """Response from chatting with a persona"""

    response: str
    persona_name: str
    persona_id: str


# Health Check
class HealthResponse(BaseModel):
    """Health check response"""

    status: str
    services: dict[str, str]
    version: str = "1.0.0"
