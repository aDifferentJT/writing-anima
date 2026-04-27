"""
Anima management API endpoints
"""

import base64
import logging
import uuid
from datetime import datetime
from io import BytesIO
from typing import Callable, Optional

from fastapi import APIRouter, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from ..config import get_config
from ..database import settings as settings_db
from ..corpus.embed.factory import create_embedding_generator
from ..corpus.ingest import CorpusIngester, Stage, STAGES
from ..corpus.style_pack import generate_style_pack
from ..database.general import get_general_db
from ..database.vector import get_vector_db
from ..database.vector.schema import CorpusDocument as VectorCorpusDocument
from .models import (
    AvailableModel,
    AvailableModelsResponse,
    CorpusChunk,
    CorpusCompleteMessage,
    CorpusDocumentsResponse,
    CorpusErrorMessage,
    CorpusFileModel,
    CorpusStatusMessage,
    CorpusUploadRequest,
    EmbeddingProviderInfo,
    EmbeddingProvidersResponse,
    Anima,
    AnimaCreate,
    AnimaList,
    AnimaResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/animas", tags=["animas"])


class UploadProgress:
    """Tracks top-level upload steps so completed/remaining are always derivable."""

    def __init__(self, steps: list[str]) -> None:
        self._steps = steps
        self._idx = 0

    def advance(self) -> None:
        """Mark the current step as done and move to the next."""
        self._idx += 1

    @property
    def current(self) -> str:
        """The step currently in progress."""
        return self._steps[self._idx]

    @property
    def completed(self) -> list[str]:
        """All steps that have finished."""
        return self._steps[:self._idx]

    @property
    def remaining(self) -> list[str]:
        """All steps not yet started."""
        return self._steps[self._idx + 1:]


class AnimaSubscriptionManager:
    """Broadcasts the current anima list to all subscribed WebSocket clients."""

    def __init__(self) -> None:
        self._subscribers: set[WebSocket] = set()

    def add(self, ws: WebSocket) -> None:
        """Add a subscriber."""
        self._subscribers.add(ws)

    def remove(self, ws: WebSocket) -> None:
        """Remove a subscriber."""
        self._subscribers.discard(ws)

    async def broadcast(self, anima_list: AnimaList) -> None:
        """Broadcast anima list to all subscribers."""
        data = anima_list.model_dump(mode="json")
        dead: set[WebSocket] = set()
        for ws in self._subscribers:
            try:
                await ws.send_json(data)
            except Exception:  # pylint: disable=broad-exception-caught
                dead.add(ws)
        self._subscribers -= dead


anima_subscriptions = AnimaSubscriptionManager()


async def _build_anima_list(session: Session) -> AnimaList:
    """Fetch all animas and return an AnimaList (checks Qdrant availability)."""
    animas = list(session.exec(select(Anima)))
    existing_collections = await get_vector_db().get_existing_collections()
    responses = [
        AnimaResponse.from_anima(a, corpus_available=a.collection_name in existing_collections)
        for a in animas
    ]
    return AnimaList(animas=responses, total=len(responses))


@router.get("/embedding-providers", response_model=EmbeddingProvidersResponse)
async def get_embedding_providers() -> EmbeddingProvidersResponse:
    """Get list of available embedding providers"""
    providers = [
        EmbeddingProviderInfo(id=emb.id, name=emb.name, provider=emb.provider)
        for emb in settings_db.get().embeddings
    ]
    return EmbeddingProvidersResponse(providers=providers)


@router.get("/models", response_model=AvailableModelsResponse)
async def get_available_models() -> AvailableModelsResponse:
    """Get list of available models for anima selection"""
    models = [
        AvailableModel(
            id=str(m.id), name=m.name, provider=m.provider, description=m.description
        )
        for m in settings_db.get().models
    ]
    return AvailableModelsResponse(models=models)


@router.post("", response_model=AnimaResponse, status_code=201)
async def create_anima(anima: AnimaCreate) -> AnimaResponse:
    """Create a new anima"""
    try:
        # Generate unique ID
        anima_id = uuid.uuid4()
        collection_name = f"anima_{str(anima_id)[:8]}"

        # Create anima record
        now = datetime.utcnow()
        anima_data = Anima(
            id=anima_id,
            name=anima.name,
            description=anima.description,
            collection_name=collection_name,
            corpus_file_count=0,
            chunk_count=0,
            embedding_provider=anima.embedding_provider,
            created_at=now,
            updated_at=now,
        )

        # Initialize Qdrant collection
        collection = get_vector_db().get_collection(collection_name)
        embedding_dim = settings_db.get().get_embedding(
            anima.embedding_provider
        ).dimensions
        await collection.create_collection(embedding_dim)

        # Store anima
        with Session(get_general_db()) as session:
            session.add(anima_data)
            session.commit()
            session.refresh(anima_data)
            await anima_subscriptions.broadcast(await _build_anima_list(session))

        return AnimaResponse.from_anima(anima_data, corpus_available=True)

    except Exception as e:
        logger.error("Error creating anima: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to create anima: {str(e)}"
        ) from e


def _get_anima_or_404(session: Session, anima_id: uuid.UUID) -> Anima:
    """Fetch an anima by ID or raise 404."""
    anima = session.exec(select(Anima).where(Anima.id == anima_id)).one_or_none()
    if anima is None:
        raise HTTPException(status_code=404, detail="Anima not found")
    return anima


@router.websocket("/subscribe")
async def subscribe_animas(websocket: WebSocket) -> None:
    """Push the anima list to the client on connect and on every mutation."""
    await websocket.accept()
    anima_subscriptions.add(websocket)
    try:
        with Session(get_general_db()) as session:
            await websocket.send_json((await _build_anima_list(session)).model_dump(mode="json"))
        # Keep connection alive until the client disconnects
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        anima_subscriptions.remove(websocket)


@router.get("", response_model=AnimaList)
async def list_animas() -> AnimaList:
    """List all animas"""
    try:
        with Session(get_general_db()) as session:
            statement = select(Anima)
            animas = session.exec(statement)

            # Get all existing collections once (single Qdrant call)
            existing_collections = await get_vector_db().get_existing_collections()

            # Check Qdrant collection availability for each anima
            user_animas = []
            for p in animas:
                corpus_available = p.collection_name in existing_collections
                user_animas.append(
                    AnimaResponse.from_anima(p, corpus_available=corpus_available)
                )

            return AnimaList(animas=user_animas, total=len(user_animas))

    except Exception as e:
        logger.error("Error listing animas: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to list animas: {str(e)}"
        ) from e


@router.get("/{anima_id}", response_model=AnimaResponse)
async def get_anima(anima_id: uuid.UUID) -> AnimaResponse:
    """Get a specific anima"""
    try:
        with Session(get_general_db()) as session:
            anima = _get_anima_or_404(session, anima_id)
            existing_collections = await get_vector_db().get_existing_collections()
            corpus_available = anima.collection_name in existing_collections
            return AnimaResponse.from_anima(anima, corpus_available=corpus_available)

    except HTTPException:
        raise

    except Exception as e:
        logger.error("Error getting anima: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to get anima: {str(e)}"
        ) from e


@router.delete("/{anima_id}", status_code=204)
async def delete_anima(anima_id: uuid.UUID) -> None:
    """Delete an anima and its corpus"""
    try:
        with Session(get_general_db()) as session:
            anima = _get_anima_or_404(session, anima_id)
            session.delete(anima)
            session.commit()
            logger.info("Deleted anima %s", anima_id)
            await anima_subscriptions.broadcast(await _build_anima_list(session))

    except HTTPException:
        raise

    except Exception as e:
        logger.error("Error deleting anima: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to delete anima: {str(e)}"
        ) from e


CorpusMessage = CorpusStatusMessage | CorpusCompleteMessage | CorpusErrorMessage

@router.websocket("/{anima_id}/corpus")
async def upload_corpus(websocket: WebSocket, anima_id: uuid.UUID) -> None:  # pylint: disable=too-many-locals,too-many-statements
    """Upload corpus files via WebSocket.

    Client sends: CorpusUploadRequest (JSON)
    Server sends: CorpusStatusMessage | CorpusCompleteMessage | CorpusErrorMessage (JSON)
    """
    await websocket.accept()

    try:
        request_data = await websocket.receive_text()
        request = CorpusUploadRequest.model_validate_json(request_data)

        async def send_msg(msg: CorpusMessage) -> None:
            await websocket.send_json(msg.model_dump(mode="json"))

        with Session(get_general_db()) as session:

            try:
                anima = _get_anima_or_404(session, anima_id)
            except HTTPException:
                await send_msg(CorpusErrorMessage(message="Anima not found"))
                await websocket.close()
                return

            collection_name = anima.collection_name
            collection = get_vector_db().get_collection(collection_name)
            embedding_dim = settings_db.get().get_embedding(
                anima.embedding_provider
            ).dimensions
            await collection.create_collection(embedding_dim)

            files_data = request.files
            file_names = [f.name for f in files_data]

            progress = UploadProgress(
                ["Loading embedding model"] + file_names + ["Generating style pack"]
            )

            async def send_status(
                sub_completed: list[str] | None = None,
                sub_remaining: list[str] | None = None,
                current_step: str | None = None,
                step_progress: float | None = None,
            ) -> None:
                await send_msg(CorpusStatusMessage(
                    steps_completed=progress.completed + (sub_completed or []),
                    steps_remaining=(sub_remaining or []) + progress.remaining,
                    current_step=current_step if current_step is not None else progress.current,
                    step_progress=step_progress,
                ))

            async def on_model_progress(prog: float | None) -> None:
                await send_status(step_progress=prog)

            embedder = await create_embedding_generator(
                settings_db.get().get_embedding(anima.embedding_provider),
                on_model_progress,
            )
            ingester = CorpusIngester(collection, request.corpus_config, embedder)

            progress.advance()  # "Loading embedding model" done

            total_size = 0
            total_chunks_added = 0

            for file_data in files_data:
                file_bytes = base64.b64decode(file_data.content)
                total_size += len(file_bytes)
                upload_file = UploadFile(
                    filename=file_data.name,
                    file=BytesIO(file_bytes),
                    size=len(file_bytes),
                )

                def stage(s: str, filename: str = file_data.name) -> str:
                    return f"{filename}: {s}"

                async def on_ingest_progress(
                    step: Stage,
                    step_progress: float | None,
                    stage: Callable[[str], str] = stage,
                ) -> None:
                    idx = STAGES.index(step)
                    await send_status(
                        sub_completed=[stage(s) for s in STAGES[:idx]],
                        sub_remaining=[stage(s) for s in STAGES[idx + 1:]],
                        current_step=stage(step),
                        step_progress=step_progress,
                    )

                total_chunks_added += await ingester.ingest(
                    upload_file, progress_callback=on_ingest_progress
                )

                progress.advance()  # file done

            # Get total chunk count from Qdrant
            total_chunks: int = anima.chunk_count + total_chunks_added
            try:
                collection_info = await get_vector_db().client.get_collection(collection_name)
                if collection_info.points_count is not None:
                    total_chunks = collection_info.points_count
            except:  # pylint: disable=bare-except
                pass

            await send_status()  # "Generating style pack" becomes current
            anima.corpus_file_count += len(files_data)
            anima.chunk_count = total_chunks
            anima.style_pack = await generate_style_pack(
                collection_name, get_config().retrieval.style_pack_size, embedder
            )
            progress.advance()
            anima.updated_at = datetime.utcnow()
            session.add(anima)
            session.commit()
            await anima_subscriptions.broadcast(await _build_anima_list(session))

            logger.info("Uploaded %d files via WebSocket to anima %s", len(files_data), anima_id)

            await send_msg(CorpusCompleteMessage(
                files_uploaded=len(files_data),
                total_size=total_size,
                message=f"Successfully uploaded {len(files_data)} files",
            ))
            await websocket.close()

    except WebSocketDisconnect:
        logger.info("Corpus upload WebSocket disconnected")
    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.error("Error in corpus upload WebSocket: %s", e)
        try:
            await send_msg(CorpusErrorMessage(message=f"Upload failed: {str(e)}"))
            await websocket.close()
        except:  # pylint: disable=bare-except
            pass


@router.get("/{anima_id}/corpus/documents", response_model=CorpusDocumentsResponse)
async def get_corpus_documents(anima_id: uuid.UUID) -> CorpusDocumentsResponse:  # pylint: disable=too-many-locals
    """Get all corpus documents for an anima, grouped by source file"""
    try:
        with Session(get_general_db()) as session:
            anima = _get_anima_or_404(session, anima_id)
            collection_name = anima.collection_name
            collection = get_vector_db().get_collection(collection_name)
            all_docs = await collection.get_all_documents()

            # Group chunks by filename
            files_map: dict[str, list[VectorCorpusDocument]] = {}
            for doc_item in all_docs:
                filename = doc_item.metadata.filename
                if filename not in files_map:
                    files_map[filename] = []
                files_map[filename].append(doc_item)

            # Build response, sorting chunks within each file and deduplicating overlaps
            files = []
            for filename, chunks in sorted(files_map.items()):  # pylint: disable=too-many-nested-blocks
                sorted_chunks = sorted(chunks, key=lambda c: c.metadata.chunk_index)

                # Deduplicate overlap regions between consecutive chunks
                last_deduped_text: Optional[str] = None
                corpus_chunks: list[CorpusChunk] = []

                for _, c in enumerate(sorted_chunks):
                    text = c.text
                    overlap_size = c.metadata.chunk_overlap

                    if overlap_size > 0:
                        if last_deduped_text is not None:
                            # Look for where the end of the previous chunk appears
                            # at the start of this chunk (the overlap region)
                            # Generous search window for overlap detection
                            suffix = last_deduped_text[-overlap_size * 2 :]
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
                            chunk_index=c.metadata.chunk_index,
                            char_length=len(text),
                        )
                    )

                files.append(
                    CorpusFileModel(
                        filename=filename,
                        chunk_count=len(corpus_chunks),
                        chunks=corpus_chunks,
                    )
                )

            return CorpusDocumentsResponse(anima_id=anima_id, files=files)

    except HTTPException:
        raise

    except Exception as e:
        logger.error("Error getting corpus documents: %s", e)
        raise HTTPException(
            status_code=500, detail=f"Failed to get corpus documents: {str(e)}"
        ) from e
