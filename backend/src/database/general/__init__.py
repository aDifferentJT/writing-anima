from datetime import datetime
from typing import Any, Optional
import uuid

from sqlmodel import Field, Session, SQLModel, create_engine, select


class Settings(SQLModel, table=True):
    auto_save_interval: int
    enable_real_time_sync: bool
    other_settings: dict[str, Any]


class Project(SQLModel, table=True):
    """Project model"""

    id: uuid.UUID = Field(primary_key=True)
    title: str
    purpose: str
    content: str
    feedback: list[None]
    writingCriteria: Optional[None]
    settings: None
    created_at: datetime
    updated_at: datetime
    last_accessed_at: datetime
    is_archived: bool


class Persona(SQLModel, table=True):
    """Persona model"""

    id: uuid.UUID = Field(primary_key=True)
    name: str
    description: Optional[str]
    collection_name: str
    model: str = "gpt-5"
    corpus_file_count: int = 0
    chunk_count: int = 0
    created_at: datetime
    updated_at: datetime


general_db = create_engine("sqlite:///general.db")

SQLModel.metadata.create_all(general_db)
