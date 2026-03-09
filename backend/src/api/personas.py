"""
Persona management API endpoints
"""

import logging
import os
import uuid
from datetime import datetime
from typing import List

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ..config import get_config
from ..corpus.ingest import CorpusIngester
from ..database.vector_db import VectorDatabase
from .models import (
    AvailableModel,
    AvailableModelsResponse,
    CorpusChunk,
    CorpusDocumentsResponse,
    CorpusFileModel,
    CorpusUploadResponse,
    IngestionStatus,
    PersonaCreate,
    PersonaList,
    PersonaResponse,
    PersonaUpdate,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/personas", tags=["personas"])

# Initialize Firebase Admin
import json

import firebase_admin
from firebase_admin import credentials, firestore

# Initialize Firebase if not already done
if not firebase_admin._apps:
    # Try to get credentials from environment variable (for Railway/production)
    firebase_creds_json = os.getenv("FIREBASE_CREDENTIALS")

    if firebase_creds_json:
        # Load from JSON string (for deployment)
        try:
            cred_dict = json.loads(firebase_creds_json)
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred)
            logger.info(
                "Firebase Admin initialized from FIREBASE_CREDENTIALS environment variable"
            )
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse FIREBASE_CREDENTIALS: {e}")
    else:
        # Fall back to file path (for local development)
        cred_path = os.getenv("FIREBASE_ADMIN_SDK_PATH", "./firebase-admin-sdk.json")
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin initialized from file")
        else:
            logger.warning(
                f"Firebase credentials not found at {cred_path}. Using in-memory storage."
            )

# Get Firestore client
try:
    db = firestore.client()
    logger.info("Firestore client initialized")
except Exception as e:
    logger.warning(f"Could not initialize Firestore: {e}. Using in-memory storage.")
    db = None

# Fallback in-memory store if Firestore unavailable
personas_store: dict = {}


@router.get("/models", response_model=AvailableModelsResponse)
async def get_available_models():
    """Get list of available models for persona selection"""
    try:
        config = get_config()
        models = [
            AvailableModel(
                id=m.id, name=m.name, provider=m.provider, description=m.description
            )
            for m in config.model.available_models
        ]
        return AvailableModelsResponse(models=models)
    except Exception as e:
        logger.error(f"Error getting available models: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get available models: {str(e)}"
        )


@router.post("", response_model=PersonaResponse, status_code=201)
async def create_persona(persona: PersonaCreate):
    """Create a new writing persona"""
    try:
        # Generate unique ID
        persona_id = str(uuid.uuid4())
        collection_name = f"user_{persona.user_id[:8]}_persona_{persona_id[:8]}"

        # Create persona record
        now = datetime.utcnow()
        persona_data = {
            "id": persona_id,
            "name": persona.name,
            "description": persona.description,
            "user_id": persona.user_id,
            "collection_name": collection_name,
            "model": persona.model,
            "corpus_file_count": 0,
            "chunk_count": 0,
            "created_at": now,
            "updated_at": now,
        }

        # Initialize Qdrant collection
        vector_db = VectorDatabase(collection_name)
        vector_db.create_collection()

        # Store persona in Firestore or fallback to memory
        if db is not None:
            db.collection("personas").document(persona_id).set(persona_data)
            logger.info(
                f"Created persona {persona_id} in Firestore for user {persona.user_id}"
            )
        else:
            personas_store[persona_id] = persona_data
            logger.info(
                f"Created persona {persona_id} in memory for user {persona.user_id}"
            )

        return PersonaResponse(**persona_data)

    except Exception as e:
        logger.error(f"Error creating persona: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to create persona: {str(e)}"
        )


def get_existing_collections() -> set:
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
        logger.warning(f"Could not get collections from Qdrant: {e}")
        return set()


@router.get("", response_model=PersonaList)
async def list_personas(user_id: str):
    """List all personas for a user"""
    try:
        personas_data = []

        if db is not None:
            # Query Firestore
            personas_ref = (
                db.collection("personas").where("user_id", "==", user_id).stream()
            )
            personas_data = [doc.to_dict() for doc in personas_ref]
        else:
            # Fallback to memory
            personas_data = [
                p for p in personas_store.values() if p["user_id"] == user_id
            ]

        # Get all existing collections once (single Qdrant call)
        existing_collections = get_existing_collections()

        # Check Qdrant collection availability for each persona
        user_personas = []
        for p in personas_data:
            corpus_available = p["collection_name"] in existing_collections
            user_personas.append(
                PersonaResponse(**p, corpus_available=corpus_available)
            )

        return PersonaList(personas=user_personas, total=len(user_personas))

    except Exception as e:
        logger.error(f"Error listing personas: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to list personas: {str(e)}"
        )


@router.get("/{persona_id}", response_model=PersonaResponse)
async def get_persona(persona_id: str, user_id: str):
    """Get a specific persona"""
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

    # Verify ownership
    if persona["user_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this persona"
        )

    return PersonaResponse(**persona)


@router.patch("/{persona_id}", response_model=PersonaResponse)
async def update_persona(persona_id: str, user_id: str, updates: PersonaUpdate):
    """Update a persona's settings (name, description, model)"""
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

    # Verify ownership
    if persona["user_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this persona"
        )

    try:
        # Build update dict with only provided fields
        update_data = {}
        if updates.name is not None:
            update_data["name"] = updates.name
        if updates.description is not None:
            update_data["description"] = updates.description
        if updates.model is not None:
            update_data["model"] = updates.model

        if update_data:
            update_data["updated_at"] = datetime.utcnow()

            # Update in Firestore or memory
            if db is not None:
                db.collection("personas").document(persona_id).update(update_data)
                # Refresh persona data
                doc = db.collection("personas").document(persona_id).get()
                persona = doc.to_dict()
            else:
                personas_store[persona_id].update(update_data)
                persona = personas_store[persona_id]

        logger.info(f"Updated persona {persona_id}: {list(update_data.keys())}")
        return PersonaResponse(**persona)

    except Exception as e:
        logger.error(f"Error updating persona: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to update persona: {str(e)}"
        )


@router.delete("/{persona_id}", status_code=204)
async def delete_persona(persona_id: str, user_id: str):
    """Delete a persona and its corpus"""
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

    # Verify ownership
    if persona["user_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to delete this persona"
        )

    try:
        # Delete Qdrant collection
        collection_name = persona["collection_name"]
        vector_db = VectorDatabase(collection_name)
        vector_db.delete_collection()

        # Remove from Firestore or memory
        if db is not None:
            db.collection("personas").document(persona_id).delete()
        else:
            del personas_store[persona_id]

        logger.info(f"Deleted persona {persona_id}")

    except Exception as e:
        logger.error(f"Error deleting persona: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to delete persona: {str(e)}"
        )


@router.post("/{persona_id}/corpus", response_model=CorpusUploadResponse)
async def upload_corpus(
    persona_id: str, user_id: str = Form(...), files: List[UploadFile] = File(...)
):
    """Upload corpus files for a persona"""
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

    # Verify ownership
    if persona["user_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to modify this persona"
        )

    try:
        # Save uploaded files temporarily
        import os
        import tempfile

        temp_dir = tempfile.mkdtemp()
        saved_files = []
        total_size = 0

        for file in files:
            if file.filename:
                # Save file
                file_path = os.path.join(temp_dir, file.filename)
                content = await file.read()
                total_size += len(content)

                with open(file_path, "wb") as f:
                    f.write(content)

                saved_files.append(file_path)

        # Ingest corpus
        collection_name = persona["collection_name"]

        # Ensure collection exists (create if missing - handles re-upload case)
        vector_db = VectorDatabase(collection_name)
        vector_db.create_collection()

        ingester = CorpusIngester(collection_name)

        # Process files
        total_chunks_added = 0
        for file_path in saved_files:
            chunks_added = ingester.ingest_file(file_path)
            total_chunks_added += chunks_added

        # Get total chunk count from Qdrant
        vector_db = VectorDatabase(collection_name)
        try:
            collection_info = vector_db.client.get_collection(collection_name)
            total_chunks: int = collection_info.points_count
        except:
            total_chunks = persona.get("chunk_count", 0) + total_chunks_added

        # Update persona metadata
        persona["corpus_file_count"] += len(files)
        persona["chunk_count"] = total_chunks
        persona["updated_at"] = datetime.utcnow()

        # Save updated metadata
        if db is not None:
            db.collection("personas").document(persona_id).update(
                {
                    "corpus_file_count": persona["corpus_file_count"],
                    "chunk_count": persona["chunk_count"],
                    "updated_at": persona["updated_at"],
                }
            )
        # else: persona dict is already updated in memory

        # Cleanup temp files
        import shutil

        shutil.rmtree(temp_dir)

        logger.info(f"Uploaded {len(files)} files to persona {persona_id}")

        return CorpusUploadResponse(
            persona_id=persona_id,
            files_uploaded=len(files),
            total_size=total_size,
            message=f"Successfully uploaded {len(files)} files",
        )

    except Exception as e:
        logger.error(f"Error uploading corpus: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to upload corpus: {str(e)}"
        )


@router.get("/{persona_id}/corpus/status", response_model=IngestionStatus)
async def get_ingestion_status(persona_id: str, user_id: str):
    """Get corpus ingestion status"""
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

    # Verify ownership
    if persona["user_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this persona"
        )

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

    except Exception as e:
        logger.error(f"Error getting ingestion status: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to get status: {str(e)}")


@router.get("/{persona_id}/corpus/documents", response_model=CorpusDocumentsResponse)
async def get_corpus_documents(persona_id: str, user_id: str):
    """Get all corpus documents for a persona, grouped by source file"""
    persona = None

    if db is not None:
        doc = db.collection("personas").document(persona_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Persona not found")
        persona = doc.to_dict()
    else:
        if persona_id not in personas_store:
            raise HTTPException(status_code=404, detail="Persona not found")
        persona = personas_store[persona_id]

    if persona["user_id"] != user_id:
        raise HTTPException(
            status_code=403, detail="Not authorized to access this persona"
        )

    try:
        config = get_config()
        collection_name = persona["collection_name"]
        vector_db = VectorDatabase(collection_name)
        all_docs = vector_db.get_all_documents()

        # Group chunks by file_path
        files_map: dict = {}
        for doc_item in all_docs:
            metadata = doc_item.get("metadata", {})
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
            deduped_texts = []
            for i, c in enumerate(sorted_chunks):
                text = c["text"]
                if i > 0 and overlap_size > 0 and deduped_texts:
                    prev_text = deduped_texts[-1]
                    # Look for where the end of the previous chunk appears
                    # at the start of this chunk (the overlap region)
                    suffix = prev_text[-overlap_size * 2 :]  # generous search window
                    best_overlap = 0
                    for length in range(min(len(suffix), len(text)), 0, -1):
                        if text[:length] == suffix[-length:]:
                            best_overlap = length
                            break
                    if best_overlap > 0:
                        text = text[best_overlap:]
                deduped_texts.append(text)

            corpus_chunks = [
                CorpusChunk(
                    text=deduped_texts[i],
                    chunk_index=c.get("metadata", {}).get("chunk_index", i),
                    char_length=len(deduped_texts[i]),
                )
                for i, c in enumerate(sorted_chunks)
            ]
            files.append(
                CorpusFileModel(
                    file_path=file_path,
                    filename=filename,
                    chunk_count=len(corpus_chunks),
                    chunks=corpus_chunks,
                )
            )

        return CorpusDocumentsResponse(persona_id=persona_id, files=files)

    except Exception as e:
        logger.error(f"Error getting corpus documents: {e}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get corpus documents: {str(e)}"
        )
