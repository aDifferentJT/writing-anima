"""
Writing analysis API endpoints using Anima
"""

import json
import logging
import re
import time
import uuid
from difflib import SequenceMatcher
from typing import Optional

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from openai.types.chat import ChatCompletionMessageParam
from sqlmodel import Session, select

from ..agent.base import Response
from ..agent.factory import create_agent
from ..config import get_config
from ..database.general import get_general_db
from .models import (
    AnalysisRequest,
    ChatRequest,
    CorpusSource,
    FeedbackItem,
    FeedbackSeverity,
    FeedbackType,
    Anima,
    StreamComplete,
    StreamFeedback,
    StreamStatus,
    TextPosition,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["analysis"])


def get_anima(anima_id: str) -> Optional[Anima]:
    """Get anima from general database"""
    with Session(get_general_db()) as session:
        statement = select(Anima).where(Anima.id == anima_id)
        anima = session.exec(statement).one()

        if anima is None:
            return None

        return anima


def _norm_with_map(text: str) -> tuple[str, list[int]]:
    """
    Collapse whitespace runs to a single space.
    Returns (normalised_string, index_map) where index_map[i] is the position
    in *text* of the i-th character in the normalised string.
    """
    norm_chars: list[str] = []
    index_map: list[int] = []
    i = 0
    while i < len(text):
        if text[i].isspace():
            norm_chars.append(" ")
            index_map.append(i)
            i += 1
            while i < len(text) and text[i].isspace():
                i += 1
        else:
            norm_chars.append(text[i])
            index_map.append(i)
            i += 1
    return "".join(norm_chars), index_map


def _fuzzy_span(norm_orig: str, norm_q: str, threshold: float) -> tuple[int, int] | None:
    """Sliding-window fuzzy match; returns (start, end) in norm_orig or None."""
    qlen = len(norm_q)
    wlen = qlen + qlen // 5  # slightly wider window absorbs small insertions
    best_ratio = 0.0
    best_span = (0, wlen)
    for start in range(0, max(1, len(norm_orig) - qlen // 2 + 1), max(1, qlen // 10)):
        window = norm_orig[start : start + wlen]
        ratio = SequenceMatcher(None, norm_q, window, autojunk=False).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_span = (start, start + wlen)
    return best_span if best_ratio >= threshold else None


def _find_text_position(
    original: str, quoted: str, threshold: float = 0.82
) -> tuple[int, int] | None:
    """
    Find quoted text in original with fuzzy matching.

    Tries in order:
    1. Exact substring match
    2. Whitespace-normalised match (handles newline/space differences)
    3. Sliding-window fuzzy match via SequenceMatcher (for quotes >= 20 chars)

    Always returns offsets into *original* (not the normalised string).
    """
    if not quoted or not original:
        return None

    # 1. Exact
    idx = original.find(quoted)
    if idx != -1:
        return idx, idx + len(quoted)

    # Build a whitespace-normalised version of original plus a map back to
    # original indices — index_map[i] = position in original of norm_orig[i].
    norm_orig, index_map = _norm_with_map(original)
    norm_q = re.sub(r"\s+", " ", quoted).strip()

    def _to_orig(norm_start: int, norm_end: int) -> tuple[int, int]:
        orig_start = index_map[norm_start]
        last = min(norm_end - 1, len(index_map) - 1)
        orig_end = index_map[last] + 1
        return orig_start, orig_end

    # 2. Normalised exact match
    idx = norm_orig.find(norm_q)
    if idx != -1:
        return _to_orig(idx, idx + len(norm_q))

    # 3. Fuzzy sliding window (skip very short quotes — too many false positives)
    if len(norm_q) < 20:
        return None
    span = _fuzzy_span(norm_orig, norm_q, threshold)
    return _to_orig(*span) if span else None


def parse_json_feedback(  # pylint: disable=too-many-locals,too-many-branches,too-many-statements,too-many-nested-blocks
    response_text: str,
    anima_name: str,
    model: str,
    original_content: str,
) -> list[FeedbackItem]:
    """
    Parse JSON feedback from Anima's structured output.

    Args:
        response_text: JSON string from Anima
        original_content: The original text that was analyzed (used to compute
                          accurate start/end offsets from quoted text snippets)
        anima_name: Name of the anima for logging
        model: Model identifier that generated the feedback (e.g., "gpt-5", "kimi-k2")

    Returns:
        List of FeedbackItem objects
    """
    try:
        # Log raw response for debugging
        logger.info("Raw JSON response (first 2000 chars): %s", response_text[:2000])

        # Preprocess: Extract JSON from response in case model added preamble text
        # Look for JSON array [ ... ] or object { ... }
        json_text = response_text.strip()

        # Remove markdown code fences if present
        if json_text.startswith("```json"):
            json_text = json_text[7:]
        elif json_text.startswith("```"):
            json_text = json_text[3:]
        if json_text.endswith("```"):
            json_text = json_text[:-3]
        json_text = json_text.strip()

        # If response doesn't start with [ or {, try to find JSON array
        if not json_text.startswith("[") and not json_text.startswith("{"):
            # Find first [ and last ] to extract JSON array
            start_idx = json_text.find("[")
            end_idx = json_text.rfind("]")
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                json_text = json_text[start_idx : end_idx + 1]
                logger.info("Extracted JSON array from response (removed preamble)")
            else:
                # Try to find JSON object
                start_idx = json_text.find("{")
                end_idx = json_text.rfind("}")
                if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                    json_text = json_text[start_idx : end_idx + 1]
                    logger.info(
                        "Extracted JSON object from response (removed preamble)"
                    )

        # Parse JSON response
        feedback_data = json.loads(json_text)

        # Handle both array and object responses
        # With strict schema, it should be wrapped in {"feedback": [...]}
        if isinstance(feedback_data, dict):
            # If it's wrapped in a key, try to extract the array
            # Prioritize 'feedback' since that's what our strict schema uses
            extracted = False
            for key in ["feedback", "items", "analysis", "response"]:
                if key in feedback_data and isinstance(feedback_data[key], list):
                    feedback_data = feedback_data[key]
                    logger.info("Extracted feedback array from '%s' wrapper", key)
                    extracted = True
                    break

            # If it's a single feedback object (Kimi sometimes returns this), wrap in array
            if not extracted and (
                "text" in feedback_data
                or "content" in feedback_data
                or "type" in feedback_data
            ):
                logger.info("Converting single feedback object to array")
                feedback_data = [feedback_data]

        if not isinstance(feedback_data, list):
            logger.error("Expected JSON array, got: %s", type(feedback_data))
            return []

        feedback_items = []
        for i, item in enumerate(feedback_data):
            try:
                logger.info("Parsing item %d: keys=%s", i, list(item.keys()))
                logger.info(
                    "Item %d sample: type=%s, title=%s",
                    i, item.get('type'), item.get('title', '')[:50]
                )
                # Log content field specifically
                content_value = item.get("content", "")
                logger.info(
                    "Item %d content length: %d, preview: %s",
                    i, len(content_value), content_value[:100] if content_value else '[EMPTY]'
                )

                # Handle both expected schema and actual model output
                # Model uses many different field names - check all variants
                # For content field, try: content, description, feedback,
                # recommendation, action, suggestion, issue, rationale
                content = (
                    item.get("content")
                    or item.get("text")  # Kimi sometimes uses this
                    or item.get("description")  # Kimi uses this
                    or item.get("feedback")
                    or item.get("recommendation")
                    or item.get("action")
                    or item.get("suggestion")
                    or item.get("rationale")
                    or ""
                )

                # For title field, try: title, item, issue, area, location
                title = (
                    item.get("title")
                    or item.get("item")
                    or item.get("issue")
                    or item.get("area")
                    or item.get("location")
                    or "Feedback"
                )

                # For sources field, try: corpus_references, grounding, reference
                sources = (
                    item.get("corpus_references")
                    or item.get("grounding")
                    or item.get("reference")
                    or []
                )

                # For positions field, try: text_positions, positions
                raw_positions = (
                    item.get("text_positions") or item.get("positions") or []
                )
                positions = []
                if isinstance(raw_positions, list):
                    for pos in raw_positions:
                        if isinstance(pos, dict) and pos.get("text"):
                            quoted_text = pos["text"]
                            span = _find_text_position(original_content, quoted_text)
                            if span:
                                start, end = span
                                # Use the actual slice from the original so the
                                # displayed text always has correct whitespace,
                                # even when the model stripped newlines/spaces.
                                display_text = original_content[start:end]
                                positions.append(
                                    TextPosition(
                                        start=start, end=end, text=display_text
                                    )
                                )

                # For corpus_sources field - actual quoted passages from corpus
                raw_corpus_sources = item.get("corpus_sources") or []
                corpus_sources = []
                if isinstance(raw_corpus_sources, list):
                    for src in raw_corpus_sources:
                        if isinstance(src, dict) and "text" in src:
                            corpus_sources.append(
                                CorpusSource(
                                    text=src.get("text", ""),
                                    source_file=src.get("source_file"),
                                    relevance=src.get("relevance"),
                                )
                            )

                # Handle Kimi's flat format where source_file/relevance are directly on item
                if not corpus_sources and item.get("source_file"):

                    corpus_sources.append(
                        CorpusSource(
                            text=content[:200]
                            if content
                            else "",  # Use content as the text
                            source_file=item.get("source_file"),
                            relevance=item.get("relevance"),
                        )
                    )

                # Validate and create FeedbackItem
                # Handle unknown feedback types by falling back to 'suggestion'
                raw_type = item.get("type", "suggestion")
                try:
                    feedback_type = FeedbackType(raw_type)
                except ValueError:
                    logger.warning(
                        "Unknown feedback type '%s', falling back to 'suggestion'",
                        raw_type
                    )
                    feedback_type = FeedbackType.SUGGESTION

                # Handle severity mapping (Kimi uses minor/moderate/major)
                raw_severity = item.get("severity", "medium")
                severity_map = {
                    "minor": "low",
                    "moderate": "medium",
                    "major": "high",
                    "critical": "high",
                }
                mapped_severity = severity_map.get(raw_severity, raw_severity)
                try:
                    severity = FeedbackSeverity(mapped_severity)
                except ValueError:
                    logger.warning(
                        "Unknown severity '%s', falling back to 'medium'",
                        raw_severity
                    )
                    severity = FeedbackSeverity.MEDIUM

                feedback_items.append(
                    FeedbackItem(
                        id=str(uuid.uuid4()),
                        type=feedback_type,
                        category=item.get("category", "general"),
                        title=title[:100],  # Limit title length
                        content=content,
                        severity=severity,
                        confidence=float(item.get("confidence", 0.7)),
                        sources=sources if isinstance(sources, list) else [],
                        corpus_sources=corpus_sources,
                        positions=positions,
                        model=model,
                    )
                )
            except Exception as e:  # pylint: disable=broad-exception-caught
                logger.error("Error parsing feedback item: %s, item: %s", e, item)
                continue

        logger.info("Parsed %d feedback items from JSON", len(feedback_items))
        return feedback_items

    except json.JSONDecodeError as e:
        logger.error("Failed to parse JSON feedback: %s", e)
        logger.error("Response text: %s", response_text[:500])

        # Fallback: try to extract any JSON array from the text
        json_match = re.search(r"\[.*\]", response_text, re.DOTALL)
        if json_match:
            try:
                feedback_data = json.loads(json_match.group(0))
                return parse_json_feedback(
                    json.dumps(feedback_data), anima_name, model,
                    original_content=original_content,
                )
            except Exception:  # pylint: disable=bare-except,broad-exception-caught
                pass

        return []
    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.error("Unexpected error parsing feedback: %s", e)
        return []


@router.websocket("/analyze")
async def analyze_writing_stream(websocket: WebSocket) -> None:  # pylint: disable=too-many-locals,too-many-branches,too-many-statements,too-many-nested-blocks
    """
    Analyze writing with streaming updates via WebSocket
    """
    await websocket.accept()

    try:
        request_data = await websocket.receive_text()
        request_dict = json.loads(request_data)

        try:
            request = AnalysisRequest(**request_dict)
        except Exception as e:  # pylint: disable=broad-exception-caught
            await websocket.send_json(
                {"type": "error", "message": f"Invalid request: {str(e)}"}
            )
            await websocket.close()
            return

        # Get and verify anima
        try:
            anima = get_anima(request.anima_id)
            if not anima:
                await websocket.send_json(
                    {"type": "error", "message": "Anima not found"}
                )
                await websocket.close()
                return
        except HTTPException as e:
            await websocket.send_json({"type": "error", "message": e.detail})
            await websocket.close()
            return

        start_time = time.time()

        # Send initial status
        await websocket.send_text(
            StreamStatus(message="Initializing Anima...", progress=0.1).model_dump_json()
        )

        # Get configuration and create agent with JSON mode
        logger.info(
            "Using model: %s for anima: %s",
            request.model, anima.name
        )

        # Create agent using factory with selected model
        model = get_config().get_model(request.model)
        agent = create_agent(
            model=model,
            anima_id=request.anima_id,
            config=get_config(),
            # Note: DeepSeek doesn't support strict JSON schema, so skip for those agents
            use_json_mode = model.provider != "deepseek",
            prompt_file="writing_critic.txt",
        )

        # Send status
        await websocket.send_text(
            StreamStatus(
                message=f"Anima ready ({request.model}), starting analysis...",
                progress=0.2,
            ).model_dump_json()
        )

        # Build query (same as non-streaming)
        query = "Please analyze the following writing"

        if request.context.purpose:
            query += f" (Purpose: {request.context.purpose})"

        if request.context.criteria:
            criteria_text = ", ".join(request.context.criteria)
            query += f"\nEvaluation criteria: {criteria_text}"

        query += f"\n\nText to analyze:\n{request.content}"
        query += (
            "\n\nProvide specific, actionable feedback grounded in your corpus. "
            "Return your response as a JSON array of feedback items as specified "
            "in your instructions."
        )

        # Use streaming if available
        result = None
        if hasattr(agent, "respond_stream"):
            # Stream from agent
            async for chunk in agent.respond_stream(query):
                if chunk.get("type") == "status":
                    # Send status updates
                    await websocket.send_text(
                        StreamStatus(
                            message=chunk.get("message", "Processing..."),
                            tool=chunk.get("tool"),
                            progress=0.5,  # Mid-progress
                        ).model_dump_json()
                    )
                elif chunk.get("type") == "text":
                    # Text chunk received - could stream this too
                    pass  # For now, wait for complete response
                elif chunk.get("type") == "result":
                    # This is the final result - wrap in Response for uniform access
                    result = Response(
                        response=chunk["response"],
                        tool_calls=chunk.get("tool_calls", []),
                        iterations=chunk.get("iterations", 0),
                        model=chunk.get("model", ""),
                    )
        else:
            # Fallback to non-streaming
            await websocket.send_text(
                StreamStatus(
                    message="Analyzing with corpus retrieval...", progress=0.5
                ).model_dump_json()
            )
            result = await agent.respond(query)

        # Parse JSON feedback
        await websocket.send_text(
            StreamStatus(message="Parsing structured feedback...", progress=0.8).model_dump_json()
        )

        # Safety check - if result is None, agent didn't complete properly
        if result is None:
            logger.error("Agent did not return a result - may have stopped early")
            await websocket.send_json(
                {
                    "type": "error",
                    "message": "Agent did not return feedback. Try again.",
                }
            )
            await websocket.close()
            return

        response_text = result.response
        logger.info("Response text length: %d", len(response_text))
        logger.info("Response preview (first 1000 chars): %s", response_text[:1000])

        try:
            feedback_items = parse_json_feedback(
                response_text, anima.name, request.model,
                original_content=request.content,
            )
            logger.info("Parsed %d feedback items", len(feedback_items))
        except Exception as parse_error:  # pylint: disable=broad-exception-caught
            logger.error("Failed to parse feedback: %s", parse_error)
            await websocket.send_json(
                {
                    "type": "error",
                    "message": f"Failed to parse feedback: {str(parse_error)}",
                }
            )
            await websocket.close()
            return

        # TODO should we be cutting off like this?
        feedback_items = feedback_items[:10]
        logger.info("After max limit: %d feedback items", len(feedback_items))

        # Stream each feedback item
        for i, feedback_item in enumerate(feedback_items):
            try:
                logger.info(
                    "Sending feedback item %d/%d: %s",
                    i + 1, len(feedback_items), feedback_item.title
                )
                await websocket.send_text(StreamFeedback(item=feedback_item).model_dump_json())
                logger.debug("Successfully sent item %d", i + 1)
            except Exception as e:  # pylint: disable=broad-exception-caught
                logger.error(
                    "Error sending feedback item %d: %s, stopping stream",
                    i + 1, e
                )
                return

        # Send completion
        try:
            processing_time = time.time() - start_time
            logger.info("Sending completion message")
            await websocket.send_text(
                StreamComplete(
                    total_items=len(feedback_items), processing_time=processing_time
                ).model_dump_json()
            )
            await websocket.close()
            logger.info("Stream completed successfully")
        except Exception as e:  # pylint: disable=broad-exception-caught
            logger.error("Error sending completion: %s", e)

    except WebSocketDisconnect:
        logger.info("WebSocket disconnected by client")
    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.error("Error in streaming analysis: %s", e)
        try:
            await websocket.send_json(
                {"type": "error", "message": f"Analysis failed: {str(e)}"}
            )
            await websocket.close()
        except: # pylint: disable=bare-except
            pass


@router.websocket("/chat")
async def chat_with_anima_stream(websocket: WebSocket) -> None:  # pylint: disable=too-many-locals,too-many-statements
    """
    Chat with an anima via WebSocket with streaming text tokens.
    Client sends: { message, anima_id, conversation_history, model? }
    Server sends:
      - {"type": "status", "message": str}        — tool/progress updates
      - {"type": "token", "content": str}         — streamed text token
      - {"type": "complete", "response": str}     — full response when done
      - {"type": "error", "message": str}         — on failure
    """
    await websocket.accept()

    try:
        request_data = await websocket.receive_text()
        request_dict = json.loads(request_data)

        try:
            request = ChatRequest(**request_dict)
        except Exception as e:  # pylint: disable=broad-exception-caught
            await websocket.send_json(
                {"type": "error", "message": f"Invalid request: {str(e)}"}
            )
            await websocket.close()
            return

        message = request.message.strip()
        anima_id = request.anima_id

        # Get anima
        try:
            anima = get_anima(anima_id)
            if not anima:
                await websocket.send_json(
                    {"type": "error", "message": "Anima not found"}
                )
                await websocket.close()
                return
        except HTTPException as e:
            await websocket.send_json({"type": "error", "message": e.detail})
            await websocket.close()
            return

        model = get_config().get_model(request.model)
        agent = create_agent(
            model=model,
            anima_id=anima_id,
            config=get_config(),
            use_json_mode = False,
            prompt_file="base.txt",
        )

        conversation_history: list[ChatCompletionMessageParam] = [
            {"role": m["role"], "content": m["content"]}
            for m in request_dict.get("conversation_history", [])
        ]

        await websocket.send_json({"type": "status", "message": "Thinking..."})

        # Stream if agent supports it, otherwise fall back to non-streaming
        if hasattr(agent, "respond_stream"):
            full_response = ""
            async for chunk in agent.respond_stream(
                message, conversation_history=conversation_history
            ):
                if chunk.get("type") == "text":
                    full_response += chunk["content"]
                    await websocket.send_json(
                        {"type": "token", "content": chunk["content"]}
                    )
                elif chunk.get("type") == "status":
                    await websocket.send_json(
                        {"type": "status", "message": chunk.get("message", "")}
                    )
                elif chunk.get("type") == "result":
                    full_response = chunk.get("response", full_response)

            await websocket.send_json({"type": "complete", "response": full_response})
        else:
            result = await agent.respond(message, conversation_history=conversation_history)
            response_text = result.response
            await websocket.send_json({"type": "token", "content": response_text})
            await websocket.send_json({"type": "complete", "response": response_text})

        await websocket.close()

    except WebSocketDisconnect:
        logger.info("Chat WebSocket disconnected by client")
    except Exception as e:  # pylint: disable=broad-exception-caught
        logger.error("Error in chat stream: %s", e)
        try:
            await websocket.send_json(
                {"type": "error", "message": f"Chat failed: {str(e)}"}
            )
            await websocket.close()
        except:  # pylint: disable=bare-except
            pass
