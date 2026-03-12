"""OpenAI compatible agent implementation (GPT-4, GPT-3.5)"""

import json
import logging
import os
from pathlib import Path
from typing import Any, Generator, Literal, Optional, TypedDict

from openai import Omit, omit, OpenAI
from openai.types.chat import ChatCompletionFunctionToolParam, ChatCompletionMessageParam, ChatCompletionMessageFunctionToolCallParam, ChatCompletionToolUnionParam
from openai.types.chat.completion_create_params import ResponseFormat
from openai.types.shared_params import ResponseFormatJSONSchema

from ..config import Config, ModelConfig
from .base import BaseAgent, Response, ToolCall, ToolUse
from .tools import WritingSample

logger = logging.getLogger(__name__)

class OpenAIAgent(BaseAgent):
    """Agent using OpenAI GPT models"""
    def __init__(
        self,
        persona_id: str,
        config: Config,
        model: ModelConfig,
        use_json_mode: bool,
        prompt_file: str,
    ):
        """
        Initialize OpenAI agent.

        Args:
            persona_id: Persona identifier (e.g., "jules", "heidegger")
            config: Optional configuration object
            model: OpenAI model identifier (gpt-4, gpt-4-turbo-preview, gpt-3.5-turbo)
            use_json_mode: Whether to use JSON response format
            prompt_file: Which prompt template to use
        """
        super().__init__(
            persona_id,
            config,
            use_json_mode=use_json_mode,
        )

        api_key: Optional[str]
        if model.api_key_env is not None:
            api_key = os.getenv(model.api_key_env)

        self.client = OpenAI(
            api_key=api_key,
            base_url=model.base_url,
        )

        self.model = model
        self.prompt_file = prompt_file

    def _call_model(self, system: str, messages: list[ChatCompletionMessageParam]) -> Any:
        """Call OpenAI API"""
        # Add system message to messages (OpenAI-style)
        system_message: ChatCompletionMessageParam = {"role": "system", "content": system}
        full_messages: list[ChatCompletionMessageParam] = [system_message] + messages

        tools: list[ChatCompletionToolUnionParam] = [self.search_tool.get_tool_definition_openai()]

        # Add incremental reasoning tool if enabled
        if self.config.retrieval.incremental_mode.enabled:
            tools.append(self.reasoning_tool.get_tool_definition_openai())

        # Determine tool_choice based on config and iteration state
        tool_choice: Literal["auto", "required"] = "required" if self._should_force_tool_use() else "auto"

        return self.client.chat.completions.create(
            model=self.model.model,
            messages=full_messages,
            tools=tools,
            tool_choice=tool_choice,
            temperature=self.model.temperature,
            # Add JSON mode if enabled - use strict schema enforcement
            response_format=self._get_feedback_schema() if self.use_json_mode else omit,
        )

    def _is_complete(self, response: Any) -> bool:
        """Check if OpenAI has finished"""
        finish_reason = response.choices[0].finish_reason
        return finish_reason in ["stop", "end_turn"]

    def _parse_tool_use(self, response: Any) -> list[ToolUse]:
        """Extract tool calls from OpenAI response"""
        message = response.choices[0].message
        if not hasattr(message, "tool_calls") or not message.tool_calls:
            return []

        tools = []
        for tool_call in message.tool_calls:
            tools.append(
                ToolUse(
                    id=tool_call.id,
                    name=tool_call.function.name,
                    input=json.loads(tool_call.function.arguments),
                )
            )
        return tools

    def _extract_text(self, response: Any) -> str:
        """Extract text from OpenAI response"""
        return response.choices[0].message.content or ""

    def _format_tool_status(self, tool_name: str, tool_input: dict[str, Any]) -> str:
        """Format a user-friendly status message for tool execution"""
        if tool_name == "search_corpus":
            query = tool_input.get("query", "")[:60]
            k = tool_input.get("k", "default")
            return f'Searching corpus for: "{query}..." (k={k})'
        elif tool_name == "check_incremental_reasoning":
            query = tool_input.get("query", "")[:60]
            return f'Checking if query is out-of-distribution: "{query}..."'
        else:
            return f"Executing tool: {tool_name}"

    def _update_messages(
        self, messages: list[ChatCompletionMessageParam], response: Any, tool_results: list[Any]
    ) -> list[ChatCompletionMessageParam]:
        """Update messages with OpenAI's response and tool results"""
        message = response.choices[0].message

        # Add assistant message with tool calls
        messages.append(
            {
                "role": "assistant",
                "content": message.content,
                "tool_calls": message.tool_calls,
            }
        )

        # Add tool results
        if message.tool_calls:
            for tool_call, result in zip(message.tool_calls, tool_results):
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": str(result),
                    }
                )

        return messages

    def _rewrite_in_style(
        self, feedback_json: str, retrieved_samples: Optional[list[WritingSample]] = None
    ) -> str:
        """
        Rewrite feedback content in the author's distinctive style.

        This is a second pass that takes the structured feedback and rewrites
        the 'content' field of each item to match the author's voice.

        Args:
            feedback_json: JSON string of feedback items
            retrieved_samples: List of corpus samples retrieved during analysis
                              (preferred over style pack as they're topically relevant)

        Returns:
            JSON string with rewritten content fields
        """
        # Use retrieved samples if available (better - topically relevant)
        # Fall back to style pack if no retrieved samples
        samples = (
            retrieved_samples
            if retrieved_samples
            else self.search_tool.get_style_pack()
        )

        if not samples:
            logger.warning("No style samples available, skipping style rewrite")
            return feedback_json

        # Build style examples from retrieved samples (use top 10 for style)
        style_examples = ""
        for i, sample in enumerate(samples[:10], 1):
            # Handle both dict formats (from tool results vs style pack)
            text = sample.text
            if len(text) > 800:
                text = text[:800] + "..."
            style_examples += f"\n--- Example {i} ---\n{text}\n"

        # Build the rewrite prompt
        rewrite_prompt = f"""You ARE this author. Rewrite each feedback item as if YOU wrote it from scratch.

STUDY YOUR VOICE - These are examples of how you actually write:
{style_examples}

CRITICAL INSTRUCTION:
Below is feedback in generic voice. Your task: COMPLETELY REWRITE the "content" field of each item AS YOURSELF.

Do NOT write "about" your style or give examples of how you "might" phrase things.
Do NOT use meta-language like "Notice the more conversational quality" or "Try to capture".
Instead, JUST WRITE IN YOUR VOICE DIRECTLY.

BAD (meta-commentary): "Your writing lacks my distinctive rhythm. For instance, I might write: 'We find ourselves wanting to say...' Try to capture that quality."

GOOD (direct voice): "We find ourselves wanting to say: But hasn't the argument here fallen into the very confusion it means to warn us against? The phrasing wants more of that probing, thinking-aloud quality—the voice discovering its thought as it speaks."

The ENTIRE content field should read as if you sat down and wrote this feedback yourself. Every sentence in your natural voice. No generic LLM phrasing anywhere.

RULES:
- Keep type, category, title, severity, confidence, corpus_sources, text_positions EXACTLY the same
- ONLY rewrite the "content" field - but rewrite it COMPLETELY in your voice
- Write as yourself throughout - not "you might consider" but YOUR actual words
- First person (I/my/me) - you ARE this author giving feedback

INPUT FEEDBACK:
{feedback_json}

OUTPUT:
Return ONLY the rewritten JSON array. No explanation, no markdown fences. Start with [ and end with ]."""

        try:
            logger.info(f"Starting style rewrite phase with {len(samples)} samples...")
            logger.info(f"Style examples length: {len(style_examples)} chars")
            logger.info(f"Feedback JSON length: {len(feedback_json)} chars")
            logger.info(f"Total rewrite prompt length: {len(rewrite_prompt)} chars")
            logger.info("Calling DeepSeek API for style rewrite...")

            import time

            start_time = time.time()

            response = self.client.chat.completions.create(
                model=self.model.model,
                messages=[{"role": "user", "content": rewrite_prompt}],
                temperature=0.7,  # Slightly creative for style
            )

            elapsed = time.time() - start_time
            logger.info(f"DeepSeek style rewrite API call completed in {elapsed:.1f}s")
            logger.info(f"Response object received: {type(response)}")
            logger.info(
                f"Response choices: {len(response.choices) if response.choices else 0}"
            )

            rewritten = response.choices[0].message.content
            logger.info(f"Raw content type: {type(rewritten)}")
            if rewritten:
                rewritten = rewritten.strip()
                logger.info(f"Rewritten response length: {len(rewritten)} chars")
            else:
                logger.warning("Style rewrite returned empty content!")
                return feedback_json

            # Clean up response if needed
            if rewritten.startswith("```json"):
                rewritten = rewritten[7:]
            elif rewritten.startswith("```"):
                rewritten = rewritten[3:]
            if rewritten.endswith("```"):
                rewritten = rewritten[:-3]
            rewritten = rewritten.strip()

            # Validate it's still valid JSON
            json.loads(rewritten)  # This will raise if invalid

            logger.info("Style rewrite completed successfully")
            return rewritten

        except json.JSONDecodeError as e:
            logger.error(f"Style rewrite produced invalid JSON: {e}")
            return feedback_json  # Return original on failure
        except Exception as e:
            logger.error(f"Style rewrite failed: {e}")
            return feedback_json  # Return original on failure

    def _get_feedback_schema(self) -> ResponseFormatJSONSchema:
        """Get strict JSON schema for feedback responses"""
        return {
            "type": "json_schema",
            "json_schema": {
                "name": "feedback_response",
                "strict": True,
                "schema": {
                    "type": "object",
                    "properties": {
                        "feedback": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "type": {
                                        "type": "string",
                                        "enum": [
                                            "issue",
                                            "suggestion",
                                            "praise",
                                            "question",
                                        ],
                                    },
                                    "category": {
                                        "type": "string",
                                        "enum": [
                                            "clarity",
                                            "style",
                                            "logic",
                                            "evidence",
                                            "structure",
                                            "voice",
                                            "craft",
                                            "general",
                                        ],
                                    },
                                    "title": {"type": "string"},
                                    "content": {"type": "string"},
                                    "severity": {
                                        "type": "string",
                                        "enum": ["low", "medium", "high"],
                                    },
                                    "confidence": {"type": "number"},
                                    "corpus_references": {
                                        "type": "array",
                                        "items": {"type": "string"}
                                    },
                                    "text_positions": {
                                        "type": "array",
                                        "items": {
                                            "type": "object",
                                            "properties": {
                                                "start": {"type": "integer"},
                                                "end": {"type": "integer"},
                                                "text": {"type": "string"}
                                            },
                                            "required": ["start", "end", "text"],
                                            "additionalProperties": False
                                        }
                                    }
                                },
                                "required": [
                                    "type",
                                    "category",
                                    "title",
                                    "content",
                                    "severity",
                                    "confidence",
                                    "corpus_references",
                                    "text_positions",
                                ],
                                "additionalProperties": False
                            }
                        }
                    },
                    "required": ["feedback"],
                    "additionalProperties": False
                }
            }
        }

    class TextResponse(TypedDict):
        type: Literal["text"]
        content: str

    class StatusResponse(TypedDict):
        type: Literal["status"]
        message: str
        tool: str

    class ResultResponse(TypedDict):
        type: Literal["result"]
        response: str
        tool_calls: list[ToolCall]
        iterations: int
        model: str

    def respond_stream(
        self, query: str, conversation_history: Optional[list[ChatCompletionMessageParam]] = None
    ) -> Generator[TextResponse | StatusResponse | ResultResponse, None, None]:
        """
        Stream response from the agent.

        Args:
            query: User query
            conversation_history: Optional conversation history

        Yields:
            Dict with either:
                - {"type": "text", "content": str} - Text chunk
                - {"type": "status", "message": str, "tool": str} - Status update

        Returns:
            Final result dict with metadata
        """
        if self.prompt_file:
            system_prompt = self._build_system_prompt(self.prompt_file)
        else:
            system_prompt = self._build_system_prompt()

        # Start with conversation history if provided
        if conversation_history:
            messages = conversation_history.copy()
            messages.append({"role": "user", "content": query})
        else:
            messages = [{"role": "user", "content": query}]

        tool_calls_log: list[ToolCall] = []
        tools_called_count = 0  # Track for tool_choice logic
        retrieved_samples: list[WritingSample] = []  # Collect corpus samples for style rewrite

        logger.info(f"Starting streaming agent loop for query: {query[:100]}...")

        for iteration in range(self.model.max_iterations):
            logger.debug(f"Iteration {iteration + 1}/{self.model.max_iterations}")

            try:
                # Add system message
                system_message: ChatCompletionMessageParam = {"role": "system", "content": system_prompt}
                full_messages: list[ChatCompletionMessageParam] = [system_message] + messages

                tools: list[ChatCompletionFunctionToolParam] = [self.search_tool.get_tool_definition_openai()]

                # Add incremental reasoning tool if enabled
                if self.config.retrieval.incremental_mode.enabled:
                    tools.append(self.reasoning_tool.get_tool_definition_openai())

                logger.debug(f"Calling model with {len(tools)} tools available")
                logger.debug(f"Tool names: {[t['function']['name'] for t in tools]}")

                # Determine tool_choice: require tools only on first iteration if no tools called yet
                tool_choice: Literal["auto", "required"]
                if self.config.agent.force_tool_use and tools_called_count == 0:
                    tool_choice = "required"
                else:
                    tool_choice = "auto"
                logger.debug(
                    f"Tool choice: {tool_choice} (iteration {iteration + 1}, tools called: {tools_called_count})"
                )

                # Add JSON mode if enabled - but only AFTER tool calls are done
                response_format: ResponseFormat | Omit = omit
                if self.use_json_mode and tools_called_count > 0:
                    response_format = self._get_feedback_schema()
                    logger.debug(
                        "Strict JSON schema enforcement enabled (after tool calls)"
                    )
                elif self.use_json_mode:
                    logger.debug(
                        "JSON mode deferred until after tool calls to ensure corpus search"
                    )

                # Call with streaming
                stream = self.client.chat.completions.create(
                    model=self.model.model,
                    messages=full_messages,
                    tools=tools,
                    tool_choice=tool_choice,
                    temperature=self.model.temperature,
                    stream=True,
                    response_format=response_format,
                )

                # Collect response
                collected_content = ""
                collected_tool_calls: list[ChatCompletionMessageFunctionToolCallParam] = []

                for chunk in stream:
                    delta = chunk.choices[0].delta

                    # Handle content
                    if delta.content:
                        # If this is the first content, signal start of response
                        if not collected_content:
                            logger.info("Starting to collect response content")
                            yield {
                                "type": "status",
                                "message": "Synthesizing response...",
                                "tool": "generate",
                            }
                        collected_content += delta.content
                        yield {"type": "text", "content": delta.content}
                        logger.debug(
                            f"Collected content length now: {len(collected_content)}"
                        )

                    # Handle tool calls
                    if hasattr(delta, "tool_calls") and delta.tool_calls:
                        for tool_call_delta in delta.tool_calls:
                            # Initialize tool call if needed
                            if tool_call_delta.index >= len(collected_tool_calls):
                                collected_tool_calls.append(
                                    {
                                        "id": tool_call_delta.id or "",
                                        "type": "function",
                                        "function": {"name": "", "arguments": ""},
                                    }
                                )

                            # Update tool call
                            tc = collected_tool_calls[tool_call_delta.index]
                            if tool_call_delta.id:
                                tc["id"] = tool_call_delta.id
                            if tool_call_delta.function:
                                if tool_call_delta.function.name:
                                    tc["function"]["name"] = (
                                        tool_call_delta.function.name
                                    )
                                if tool_call_delta.function.arguments:
                                    tc["function"]["arguments"] += (
                                        tool_call_delta.function.arguments
                                    )

                    # Check if done
                    if chunk.choices[0].finish_reason in ["stop", "end_turn"]:
                        logger.info(
                            f"Agent completed in {iteration + 1} iterations with {len(tool_calls_log)} tool calls"
                        )
                        logger.info(
                            f"Final collected_content length: {len(collected_content)}"
                        )
                        logger.info(
                            f"Final collected_content preview: {collected_content[:200]}"
                        )

                        # Style rewrite phase - rewrite feedback in author's voice
                        # Uses retrieved corpus samples (topically relevant) for style grounding
                        final_response = collected_content
                        if collected_content.strip().startswith("["):
                            yield {
                                "type": "status",
                                "message": f"Rewriting feedback in author's style ({len(retrieved_samples)} samples)...",
                                "tool": "style_rewrite",
                            }
                            final_response = self._rewrite_in_style(
                                collected_content, retrieved_samples
                            )
                            logger.info(
                                f"Style rewrite phase completed using {len(retrieved_samples)} retrieved samples"
                            )

                        yield {
                            "type": "result",
                            "response": final_response,
                            "tool_calls": tool_calls_log,
                            "iterations": iteration + 1,
                            "model": self.__class__.__name__,
                        }
                        return

                # Handle tool calls if present
                if collected_tool_calls:
                    # Add assistant message with tool calls
                    messages.append(
                        {
                            "role": "assistant",
                            "content": collected_content,
                            "tool_calls": collected_tool_calls,
                        }
                    )

                    # Execute tools
                    tool_results = []
                    for tool_call in collected_tool_calls:
                        tool_use = ToolUse(
                            id=tool_call["id"],
                            name=tool_call["function"]["name"],
                            input=json.loads(tool_call["function"]["arguments"]),
                        )

                        # Yield status about tool execution
                        status_message = self._format_tool_status(
                            tool_use.name, tool_use.input
                        )
                        yield {
                            "type": "status",
                            "message": status_message,
                            "tool": tool_use.name,
                        }

                        # Yield thought fragment showing tool args
                        if tool_use.name == "search_corpus":
                            query_preview = tool_use.input.get("query", "")[:40]
                            yield {
                                "type": "status",
                                "message": f'query="{query_preview}...", k={tool_use.input.get("k", "default")}',
                                "tool": tool_use.name,
                            }
                        elif tool_use.name == "check_incremental_reasoning":
                            yield {
                                "type": "status",
                                "message": "Analyzing query distribution...",
                                "tool": tool_use.name,
                            }

                        result = self._execute_tool(tool_use)
                        tool_results.append(result)
                        tools_called_count += 1
                        tool_calls_log.append(ToolCall(
                            tool=tool_use.name,
                            input=tool_use.input,
                            result_count=len(result) if isinstance(result, list) else 1,
                        ))

                        # Detailed search logging and collect samples for style rewrite
                        if tool_use.name == "search_corpus":
                            query = tool_use.input.get("query", "")
                            k = tool_use.input.get("k", "default")
                            logger.info(
                                f'[DeepSeek SEARCH #{tools_called_count}] query="{query[:80]}" k={k} -> {len(result) if isinstance(result, list) else 0} results'
                            )
                            # Collect retrieved samples for style rewrite phase
                            if isinstance(result, list):
                                retrieved_samples.extend(result)

                        # Yield completion status with fragments
                        if isinstance(result, list) and len(result) > 0:
                            yield {
                                "type": "status",
                                "message": f"Retrieved {len(result)} results",
                                "tool": tool_use.name,
                            }
                            # Show snippet of first result
                            first_text = result[0].get("text", "")[:50].replace("\n", " ")
                            yield {
                                "type": "status",
                                "message": f'  "{first_text}..."',
                                "tool": tool_use.name,
                            }
                        elif isinstance(result, dict) and "is_ood" in result:
                            ood_status = (
                                "out-of-distribution"
                                if result.get("is_ood")
                                else "in-distribution"
                            )
                            yield {
                                "type": "status",
                                "message": f"Query is {ood_status}",
                                "tool": tool_use.name,
                            }
                            # Show reasoning fragment
                            if result.get("is_ood") and result.get("reasoning"):
                                reasoning_preview = result["reasoning"][:50]
                                yield {
                                    "type": "status",
                                    "message": f"Reason: {reasoning_preview}...",
                                    "tool": tool_use.name,
                                }
                            # Show guidance fragment if OOD
                            if result.get("is_ood") and result.get("guidance"):
                                guidance_preview = result["guidance"][:60].replace("\n", " ")
                                yield {
                                    "type": "status",
                                    "message": f"Guidance: {guidance_preview}...",
                                    "tool": tool_use.name,
                                }
                        else:
                            yield {
                                "type": "status",
                                "message": "Complete",
                                "tool": tool_use.name,
                            }

                        # Add tool result to messages
                        messages.append({
                            "role": "tool",
                            "tool_call_id": tool_call["id"],
                            "content": str(result),
                        })

                    # Continue to next iteration for final response
                    continue

            except Exception as e:
                logger.error(f"Error in streaming iteration {iteration + 1}: {e}")
                raise

        # Max iterations reached
        logger.warning(f"Max iterations ({self.model.max_iterations}) reached")

        # Style rewrite phase even on max iterations
        final_response = (
            collected_content if collected_content else "Max iterations reached"
        )
        if collected_content and collected_content.strip().startswith("["):
            yield {
                "type": "status",
                "message": f"Rewriting feedback in author's style ({len(retrieved_samples)} samples)...",
                "tool": "style_rewrite",
            }
            final_response = self._rewrite_in_style(
                collected_content, retrieved_samples
            )

        yield {
            "type": "result",
            "response": final_response,
            "tool_calls": tool_calls_log,
            "iterations": self.model.max_iterations,
            "model": self.__class__.__name__,
        }
