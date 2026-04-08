"""
Project management API endpoints
"""

import logging
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from sqlmodel import Session, desc, select

from ..database.general import general_db
from .models import (
    Project,
    ProjectUpdate,
    ProjectSettings,
    Purpose,
    WritingCriteria,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("", response_model=Project, status_code=201)
async def create_project() -> Project:
    """Create a new writing project"""
    try:
        # Create project record
        now = datetime.utcnow()
        project = Project.new(
            title="New Project",
            purpose=Purpose(topic="", context=""),
            content="",
            feedback=[],
            writing_criteria=WritingCriteria(),
            settings=ProjectSettings(),
            created_at=now,
            updated_at=now,
            last_accessed_at=now,
            is_archived=False,
        )

        # Store project
        with Session(general_db) as session:
            session.add(project)
            session.commit()
            session.refresh(project)

        return project

    except Exception as e:
        logger.error("Error creating project: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to create project: {str(e)}"
        ) from e


@router.get("", response_model=list[Project])
async def get_projects() -> list[Project]:
    """Get all the projects"""
    try:
        with Session(general_db) as session:
            return list(session.exec(
                select(Project)
                    .where(~Project.is_archived)  # type: ignore[arg-type]
                    .order_by(desc(Project.last_accessed_at))
            ))

    except Exception as e:
        logger.error("Error getting projects: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to get projects: {str(e)}"
        ) from e


@router.get("/{project_id}", response_model=Project)
async def get_project(project_id: UUID) -> Project:
    """Get a project by id"""
    try:
        with Session(general_db) as session:
            return session.exec(
                select(Project).where(Project.id == project_id)
            ).one()

    except Exception as e:
        logger.error("Error getting project: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to get project: {str(e)}"
        ) from e


@router.patch("/{project_id}", response_model=Project)
async def update_project(project_id: UUID, updates: ProjectUpdate) -> Project:
    """Update a project"""
    try:
        with Session(general_db) as session:
            project = session.exec(
                select(Project).where(Project.id == project_id)
            ).one()

            update_data = updates.model_dump(exclude_unset=True)
            for field, value in update_data.items():
                setattr(project, field, value)
            project.updated_at = datetime.utcnow()

            session.add(project)
            session.commit()
            session.refresh(project)

            return project

    except Exception as e:
        logger.error("Error updating project: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to update project: {str(e)}"
        ) from e


@router.delete("/{project_id}", status_code=204)
async def delete_project(project_id: UUID) -> None:
    """Archive a project (soft delete)"""
    try:
        with Session(general_db) as session:
            project = session.exec(
                select(Project).where(Project.id == project_id)
            ).one()

            project.is_archived = True
            project.updated_at = datetime.utcnow()

            session.add(project)
            session.commit()

    except Exception as e:
        logger.error("Error deleting project: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to delete project: {str(e)}"
        ) from e


@router.delete("/{project_id}/permanent", status_code=204)
async def permanently_delete_project(project_id: UUID) -> None:
    """Permanently delete a project"""
    try:
        with Session(general_db) as session:
            project = session.exec(
                select(Project).where(Project.id == project_id)
            ).one()

            session.delete(project)
            session.commit()

    except Exception as e:
        logger.error("Error permanently deleting project: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to permanently delete project: {str(e)}"
        ) from e
