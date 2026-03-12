"""
Project management API endpoints
"""

import logging
import os
from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlmodel import Session, desc, select

from ..config import get_config
from ..corpus.ingest import CorpusIngester
from ..database.general import (
    Project,
    Settings,
    general_db
)
from ..database.vector import VectorDatabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("create", response_model=Project, status_code=201)
async def create_project() -> Project:
    """Create a new writing project"""
    try:
        # Create project record
        now = datetime.utcnow()
        project = Project(
            title="New Project",
            purpose="",
            content="",
            feedback=[],
            writingCriteria=None,
            settings=Settings(
                auto_save_interval=30000,
                enable_real_time_sync=True,
                other_settings={},
            ),
            created_at=now,
            updated_at=now,
            last_accessed_at=now,
            is_archived=False,
        )

        # Store project
        with Session(general_db) as session:
            session.add(project)
            session.commit()

        return project

    except Exception as e:
        logger.error(f"Error creating project: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to create project: {str(e)}"
        )


@router.get("list", response_model=list[Project], status_code=201)
async def get_projects() -> list[Project]:
    """Get all the projects"""
    try:
        with Session(general_db) as session:
            return list(session.exec(
                select(Project)
                    .where(Project.is_archived == False)
                    .order_by(desc(Project.last_accessed_at))
            ))

    except Exception as e:
        logger.error(f"Error getting projects: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get projects: {str(e)}"
        )


@router.get("get", response_model=Project, status_code=201)
async def get_project(project_id: UUID) -> Project:
    """Get a project by id"""
    try:
        with Session(general_db) as session:
            return session.exec(
                select(Project).where(Project.id == project_id)
            ).one()

    except Exception as e:
        logger.error(f"Error getting project: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get project: {str(e)}"
        )


@router.patch("update", response_model=Project, status_code=201)
async def update_project(project_id: UUID, updates: Any) -> Project:
    """Update a project"""
    try:
        with Session(general_db) as session:
            project = session.exec(
                select(Project).where(Project.id == project_id)
            ).one()

            session.add(project)
            session.commit()

            return project

    except Exception as e:
        logger.error(f"Error getting project: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get project: {str(e)}"
        )
