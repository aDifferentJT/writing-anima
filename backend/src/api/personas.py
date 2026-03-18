"""
Persona management API endpoints
"""

import asyncio
import base64
import json
import logging
import os
import uuid
from datetime import datetime
from io import BytesIO
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from ..config import get_config
from ..corpus.embed.factory import EmbeddingGeneratorFactory
from ..corpus.ingest import CorpusIngester, IngestComplete, IngestProgress
from ..database.general import (
    general_db
)
from ..database.vector import VectorDatabase
from .models import (
    AvailableModel,
    AvailableModelsResponse,
    CorpusChunk,
    CorpusDocumentsResponse,
    CorpusFileModel,
    IngestionStatus,
    Persona,
    PersonaCreate,
    PersonaList,
    PersonaResponse,
    PersonaUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/personas", tags=["personas"])


@router.get("/models", response_model=AvailableModelsResponse)
async def get_available_models() -> AvailableModelsResponse:
    """Get list of available models for persona selection"""
    try:
        config = get_config()
        models = [
            AvailableModel(
                id=id, name=m.name, provider=m.provider, description=m.description
            )
            for id, m in config.models.items()
        ]
        return AvailableModelsResponse(models=models)
    except Exception as e:
        logger.error("Error getting available models: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to get available models: {str(e)}"
        ) from e


@router.post("", response_model=PersonaResponse, status_code=201)
async def create_persona(persona: PersonaCreate) -> PersonaResponse:
    """Create a new writing persona"""
    try:
        # Generate unique ID
        persona_id = uuid.uuid4()
        collection_name = f"persona_{str(persona_id)[:8]}"

        # Create persona record
        now = datetime.utcnow()
        persona_data = Persona(
            id=persona_id,
            name=persona.name,
            description=persona.description,
            collection_name=collection_name,
            model=persona.model,
            corpus_file_count=0,
            chunk_count=0,
            created_at=now,
            updated_at=now,
        )

        # Initialize Qdrant collection
        vector_db = VectorDatabase(collection_name, get_config())
        vector_db.create_collection()

        # Store persona
        with Session(general_db) as session:
            session.add(persona_data)
            session.commit()
            session.refresh(persona_data)

        return PersonaResponse.from_persona(persona_data, corpus_available=True)

    except Exception as e:
        logger.error("Error creating persona: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to create persona: {str(e)}"
        ) from e


def get_existing_collections() -> set[str]:
    """Get all existing Qdrant collection names (single connection)"""
    try:
        from qdrant_client import QdrantClient

        config = get_config()
        host = config.vector_db.host

        # Check if we're using a cloud URL (has https:// or contains cloud.qdrant.io)
        is_cloud = host.startswith("https://") or "cloud.qdrant.io" in host

        if is_cloud:
            # For Qdrant Cloud, use URL parameter
            if not host.startswith("https://"):
                url = f"https://{host}:{config.vector_db.port}"
            else:
                url = host
            client = QdrantClient(url=url, api_key=config.vector_db.api_key, https=True)
        else:
            # For local Qdrant, use host/port
            client = QdrantClient(host=host, port=config.vector_db.port)

        collections = client.get_collections().collections
        return {c.name for c in collections}
    except Exception as e:
        logger.warning("Could not get collections from Qdrant: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to get collections from Qdrant: {str(e)}"
        ) from e


@router.get("", response_model=PersonaList)
async def list_personas() -> PersonaList:
    """List all personas for a user"""
    try:
        with Session(general_db) as session:
            statement = select(Persona)
            personas = session.exec(statement)

            # Get all existing collections once (single Qdrant call)
            existing_collections = get_existing_collections()

            # Check Qdrant collection availability for each persona
            user_personas = []
            for p in personas:
                corpus_available = p.collection_name in existing_collections
                user_personas.append(
                    PersonaResponse.from_persona(p, corpus_available=corpus_available)
                )

            return PersonaList(personas=user_personas, total=len(user_personas))

    except Exception as e:
        logger.error("Error listing personas: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to list personas: {str(e)}"
        ) from e


@router.get("/{persona_id}", response_model=PersonaResponse)
async def get_persona(persona_id: uuid.UUID) -> PersonaResponse:
    """Get a specific persona"""
    try:
        with Session(general_db) as session:
            statement = select(Persona).where(Persona.id == persona_id)
            persona = session.exec(statement).one()

            if persona is None:
                raise HTTPException(status_code=404, detail="Persona not found")

            existing_collections = get_existing_collections()
            corpus_available = persona.collection_name in existing_collections

            return PersonaResponse.from_persona(persona, corpus_available=corpus_available)

    except HTTPException as e:
        raise e

    except Exception as e:
        logger.error("Error getting persona: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to get persona: {str(e)}"
        ) from e


@router.patch("/{persona_id}", response_model=PersonaResponse)
async def update_persona(persona_id: uuid.UUID, updates: PersonaUpdate) -> PersonaResponse:
    """Update a persona's settings (name, description, model)"""
    try:
        with Session(general_db) as session:
            statement = select(Persona).where(Persona.id == persona_id)
            persona = session.exec(statement).one()

            if persona is None:
                raise HTTPException(status_code=404, detail="Persona not found")

            updated = False

            if updates.name is not None:
                persona.name = updates.name
                updated = True
            if updates.description is not None:
                persona.description = updates.description
                updated = True
            if updates.model is not None:
                persona.model = updates.model
                updated = True

            if updated:
                persona.updated_at = datetime.utcnow()
                session.add(persona)
                session.commit()
                session.refresh(persona)

            logger.info("Updated persona %s", persona_id)
            existing_collections = get_existing_collections()
            return PersonaResponse.from_persona(
                persona, corpus_available=persona.collection_name in existing_collections
            )

    except HTTPException as e:
        raise e

    except Exception as e:
        logger.error("Error updating persona: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to update persona: {str(e)}"
        ) from e


@router.delete("/{persona_id}", status_code=204)
async def delete_persona(persona_id: uuid.UUID) -> None:
    """Delete a persona and its corpus"""
    try:
        with Session(general_db) as session:
            statement = select(Persona).where(Persona.id == persona_id)
            persona = session.exec(statement).one()

            if persona is None:
                raise HTTPException(status_code=404, detail="Persona not found")

            session.delete(persona)
            session.commit()
            logger.info("Deleted persona %s", persona_id)

    except HTTPException as e:
        raise e

    except Exception as e:
        logger.error("Error deleting persona: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to delete persona: {str(e)}"
        ) from e



@router.websocket("/{persona_id}/corpus/ws")
async def upload_corpus_ws(websocket: WebSocket, persona_id: uuid.UUID) -> None:
    """Upload corpus files via WebSocket.

    Client sends: {"files": [{"name": "...", "size": N, "content": "<base64>"}]}
    Server sends:
      - {"type": "status", "steps_completed": [...], "steps_remaining": [...],
         "current_step": "...", "step_progress": 0.0–1.0}
      - {"type": "complete", "files_uploaded": N, "total_size": N, "message": "..."}
      - {"type": "error", "message": "..."}
    """
    await websocket.accept()

    try:
        request_data = await websocket.receive_text()
        request_dict = json.loads(request_data)

        with Session(general_db) as session:
            statement = select(Persona).where(Persona.id == persona_id)
            persona = session.exec(statement).one()

            if persona is None:
                await websocket.send_json({"type": "error", "message": "Persona not found"})
                await websocket.close()
                return

            collection_name = persona.collection_name
            vector_db = VectorDatabase(collection_name, get_config())
            vector_db.create_collection()

            completed: list[str] = []
            files_data = request_dict.get("files", [])
            file_names = [f["name"] for f in files_data]

            async def send_status(
                remaining: list[str],
                current_steps_completed: list[str],
                current_steps_remaining: list[str],
                current_step: str,
                step_progress: float | None,
            ) -> None:
                await websocket.send_json({
                    "type": "status",
                    "steps_completed": completed + current_steps_completed,
                    "steps_remaining": current_steps_remaining + remaining,
                    "current_step": current_step,
                    "step_progress": step_progress,
                })

            loop = asyncio.get_running_loop()                                          
            def on_model_progress(progress: float | None) -> None:                            
                asyncio.run_coroutine_threadsafe(                                      
                    send_status(                                                       
                        remaining=file_names,                                          
                        current_steps_completed=[],                                    
                        current_steps_remaining=[],                                    
                        current_step="Loading embedding model",                        
                        step_progress=progress,                                        
                    ),                                                                 
                    loop,                                                              
                )                                                                      
                                                                                       
            embedder = await asyncio.to_thread(EmbeddingGeneratorFactory.create, get_config(), on_model_progress)                                                             
            ingester = CorpusIngester(collection_name, get_config(), embedder)

            completed.append("Loading embedding model")

            total_size = 0
            total_chunks_added = 0

            for file_data in files_data:
                remaining = [n for n in file_names if n not in completed and n != file_data["name"]]

                file_bytes = base64.b64decode(file_data["content"])
                total_size += len(file_bytes)
                upload_file = UploadFile(
                    filename=file_data["name"],
                    file=BytesIO(file_bytes),
                    size=len(file_bytes),
                )

                def stage(s: str) -> str:
                    return f"{file_data['name']}: {s}"

                async for update in ingester.ingest(upload_file):
                    if isinstance(update, IngestProgress):
                        await send_status(
                            remaining=remaining,
                            current_steps_completed=[stage(s) for s in update.steps_completed],
                            current_steps_remaining=[stage(s) for s in update.steps_remaining],
                            current_step=stage(update.current_step),
                            step_progress=update.step_progress,
                        )
                    elif isinstance(update, IngestComplete):
                        total_chunks_added += update.chunks_added

                completed.append(file_data["name"])

            # Get total chunk count from Qdrant
            total_chunks: int = persona.chunk_count + total_chunks_added
            try:
                collection_info = vector_db.client.get_collection(collection_name)
                if collection_info.points_count is not None:
                    total_chunks = collection_info.points_count
            except:  # pylint: disable=bare-except
                pass

            persona.corpus_file_count += len(files_data)
            persona.chunk_count = total_chunks
            persona.updated_at = datetime.utcnow()
            session.add(persona)
            session.commit()

            logger.info("Uploaded %d files via WebSocket to persona %s", len(files_data), persona_id)

            await websocket.send_json({
                "type": "complete",
                "files_uploaded": len(files_data),
                "total_size": total_size,
                "message": f"Successfully uploaded {len(files_data)} files",
            })
            await websocket.close()

    except WebSocketDisconnect:
        logger.info("Corpus upload WebSocket disconnected")
    except Exception as e:
        logger.error("Error in corpus upload WebSocket: %s", e)
        try:
            await websocket.send_json({"type": "error", "message": f"Upload failed: {str(e)}"})
            await websocket.close()
        except:  # pylint: disable=bare-except
            pass


@router.get("/{persona_id}/corpus/status", response_model=IngestionStatus)
async def get_ingestion_status(persona_id: uuid.UUID) -> IngestionStatus:
    """Get corpus ingestion status"""
    logger.error("TODO not implemented")
    raise HTTPException(status_code=500, detail="TODO not implemented")
    """ TODO
    persona = None

    if db is not None:
        # Get from Firestore
        doc = db.collection("personas").document(persona_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Persona not found")
        persona = doc.to_dict()
    else:
        # Get from memory
        if persona_id not in personas_store:
            raise HTTPException(status_code=404, detail="Persona not found")
        persona = personas_store[persona_id]

    try:
        # Get collection stats
        collection_name = persona["collection_name"]
        vector_db = VectorDatabase(collection_name)

        # Get point count from Qdrant
        try:
            collection_info = vector_db.client.get_collection(collection_name)
            total_chunks = collection_info.points_count
        except:
            total_chunks = 0

        return IngestionStatus(
            persona_id=persona_id,
            status="completed" if total_chunks > 0 else "pending",
            progress=1.0 if total_chunks > 0 else 0.0,
            chunks_processed=total_chunks,
            total_chunks=total_chunks,
            message="Ingestion complete"
            if total_chunks > 0
            else "No corpus uploaded yet",
        )

    except HTTPException as e:
        raise e

    except Exception as e:
        logger.error(f"Error getting ingestion status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")
    """


@router.get("/{persona_id}/corpus/documents", response_model=CorpusDocumentsResponse)
async def get_corpus_documents(persona_id: uuid.UUID) -> CorpusDocumentsResponse:
    """Get all corpus documents for a persona, grouped by source file"""
    try:
        with Session(general_db) as session:
            statement = select(Persona).where(Persona.id == persona_id)
            persona = session.exec(statement).one()

            if persona is None:
                raise HTTPException(status_code=404, detail="Persona not found")

            config = get_config()
            collection_name = persona.collection_name
            vector_db = VectorDatabase(collection_name, get_config())
            all_docs = vector_db.get_all_documents()

            # Group chunks by file_path
            files_map: dict[str, Any] = {}
            for doc_item in all_docs:
                metadata = doc_item["metadata"]
                file_path = metadata.get("file_path", "unknown")
                if file_path not in files_map:
                    files_map[file_path] = []
                files_map[file_path].append(doc_item)

            # Build response, sorting chunks within each file and deduplicating overlaps
            overlap_size = config.corpus.chunk_overlap
            files = []
            for file_path, chunks in sorted(files_map.items()):
                filename = os.path.basename(file_path)
                sorted_chunks = sorted(
                    chunks, key=lambda c: c.get("metadata", {}).get("chunk_index", 0)
                )

                # Deduplicate overlap regions between consecutive chunks
                last_deduped_text: Optional[str] = None
                corpus_chunks: list[CorpusChunk] = []

                for i, c in enumerate(sorted_chunks):
                    text = c["text"]

                    if overlap_size > 0 and last_deduped_text is not None:
                        # Look for where the end of the previous chunk appears
                        # at the start of this chunk (the overlap region)
                        suffix = last_deduped_text[-overlap_size * 2 :]  # generous search window
                        best_overlap = 0
                        for length in range(min(len(suffix), len(text)), 0, -1):
                            if text[:length] == suffix[-length:]:
                                best_overlap = length
                                break
                        if best_overlap > 0:
                            text = text[best_overlap:]

                    last_deduped_text = text

                    corpus_chunks.append(
                        CorpusChunk(
                            text=text,
                            chunk_index=c.get("metadata", {}).get("chunk_index", i),
                            char_length=len(text),
                        )
                    )

                files.append(
                    CorpusFileModel(
                        file_path=file_path,
                        filename=filename,
                        chunk_count=len(corpus_chunks),
                        chunks=corpus_chunks,
                    )
                )

            return CorpusDocumentsResponse(persona_id=persona_id, files=files)

    except HTTPException as e:
        raise e

    except Exception as e:
        logger.error("Error getting corpus documents: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to get corpus documents: {str(e)}"
        ) from e
