"""OpenAI agent implementation (GPT-4, GPT-3.5)"""

import os
import json
import logging
from typing import List, Dict, Any, Optional, Generator
from pathlib import Path

from openai import OpenAI
from .base import BaseAgent, ToolCall

logger = logging.getLogger(__name__)


class OpenAIAgent(BaseAgent):
    """Agent using OpenAI GPT models"""

    def __init__(
        self,
        persona_id: str,
        config=None,
        model: str = "gpt-4o",
        use_json_mode: bool = False,
        prompt_file: str = "base.txt",
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
        super().__init__(persona_id, config)

        # Get API key
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY not found in environment variables"
            )

        self.client = OpenAI(api_key=api_key)
        self.model = model
        self.max_iterations = 20
        self.use_json_mode = use_json_mode
        self.prompt_file = prompt_file

        logger.info(f"Initialized OpenAIAgent with model: {model}, JSON mode: {use_json_mode}")

    def _get_feedback_schema(self) -> Dict:
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
                                    "type": {"type": "string", "enum": ["issue", "suggestion", "praise", "question"]},
                                    "category": {"type": "string", "enum": ["clarity", "style", "logic", "evidence", "structure", "voice", "craft", "general"]},
                                    "title": {"type": "string"},
                                    "content": {"type": "string"},
                                    "severity": {"type": "string", "enum": ["low", "medium", "high"]},
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
                                "required": ["type", "category", "title", "content", "severity", "confidence", "corpus_references", "text_positions"],
                                "additionalProperties": False
                            }
                        }
                    },
                    "required": ["feedback"],
                    "additionalProperties": False
                }
            }
        }

    def _call_model(self, system: str, messages: List[Dict]) -> Any:
        """Call OpenAI API"""
        # Add system message to messages (OpenAI-style)
        full_messages = [{"role": "system", "content": system}] + messages

        tools = [self.search_tool.get_tool_definition_openai()]

        # Add incremental reasoning tool if enabled
        if self.config.retrieval.incremental_mode.enabled:
            tools.append(self.reasoning_tool.get_tool_definition_openai())

        # Determine tool_choice based on config and iteration state
        tool_choice = "required" if self._should_force_tool_use() else "auto"

        # Build API call parameters
        api_params = {
            "model": self.model,
            "messages": full_messages,
            "tools": tools,
            "tool_choice": tool_choice,
            "temperature": 1.0,
        }

        # Add JSON mode if enabled - use strict schema enforcement
        if self.use_json_mode:
            api_params["response_format"] = self._get_feedback_schema()

        return self.client.chat.completions.create(**api_params)

    def _is_complete(self, response: Any) -> bool:
        """Check if OpenAI has finished"""
        finish_reason = response.choices[0].finish_reason
        return finish_reason in ["stop", "end_turn"]

    def _parse_tool_use(self, response: Any) -> List[Dict]:
        """Extract tool calls from OpenAI response"""
        message = response.choices[0].message
        if not hasattr(message, "tool_calls") or not message.tool_calls:
            return []

        tools = []
        for tool_call in message.tool_calls:
            tools.append(
                {
                    "id": tool_call.id,
                    "name": tool_call.function.name,
                    "input": json.loads(tool_call.function.arguments),
                }
            )
        return tools

    def _extract_text(self, response: Any) -> str:
        """Extract text from OpenAI response"""
        return response.choices[0].message.content or ""

    def _format_tool_status(self, tool_name: str, tool_input: Dict[str, Any]) -> str:
        """Format a user-friendly status message for tool execution"""
        if tool_name == "search_corpus":
            query = tool_input.get("query", "")[:60]
            k = tool_input.get("k", "default")
            return f"Searching corpus for: \"{query}...\" (k={k})"
        elif tool_name == "check_incremental_reasoning":
            query = tool_input.get("query", "")[:60]
            return f"Checking if query is out-of-distribution: \"{query}...\""
        else:
            return f"Executing tool: {tool_name}"

    def _update_messages(
        self, messages: List[Dict], response: Any, tool_results: List[Any]
    ) -> List[Dict]:
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

    def respond_stream(self, query: str, conversation_history: Optional[List[Dict]] = None) -> Generator[Dict[str, Any], None, Dict]:
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
        system_prompt = self._build_system_prompt(self.prompt_file)

        # Start with conversation history if provided
        if conversation_history:
            messages = conversation_history.copy()
            messages.append({"role": "user", "content": query})
        else:
            messages = [{"role": "user", "content": query}]

        tool_calls_log: List[ToolCall] = []
        tools_called_count = 0  # Track for tool_choice logic

        logger.info(f"Starting streaming agent loop for query: {query[:100]}...")

        for iteration in range(self.max_iterations):
            logger.debug(f"Iteration {iteration + 1}/{self.max_iterations}")

            try:
                # Add system message
                full_messages = [{"role": "system", "content": system_prompt}] + messages

                tools = [self.search_tool.get_tool_definition_openai()]

                # Add incremental reasoning tool if enabled
                if self.config.retrieval.incremental_mode.enabled:
                    tools.append(self.reasoning_tool.get_tool_definition_openai())

                logger.debug(f"Calling model with {len(tools)} tools available")
                logger.debug(f"Tool names: {[t['function']['name'] for t in tools]}")

                # Determine tool_choice: require tools only on first iteration if no tools called yet
                # After first tool use, allow model to finish naturally
                if self.config.agent.force_tool_use and tools_called_count == 0:
                    tool_choice = "required"
                else:
                    tool_choice = "auto"
                logger.debug(f"Tool choice: {tool_choice} (iteration {iteration + 1}, tools called: {tools_called_count})")

                # Build API call parameters
                api_params = {
                    "model": self.model,
                    "messages": full_messages,
                    "tools": tools,
                    "tool_choice": tool_choice,
                    "temperature": 1.0,
                    "stream": True,
                }

                # Add JSON mode if enabled - but only AFTER tool calls are done
                # JSON mode can interfere with tool calling, so we defer it
                if self.use_json_mode and tools_called_count > 0:
                    api_params["response_format"] = self._get_feedback_schema()
                    logger.debug("Strict JSON schema enforcement enabled (after tool calls)")
                elif self.use_json_mode:
                    logger.debug("JSON mode deferred until after tool calls to ensure corpus search")

                # Call with streaming
                stream = self.client.chat.completions.create(**api_params)

                # Collect response
                collected_content = ""
                collected_tool_calls: List[Dict[str, Any]] = []

                for chunk in stream:
                    delta = chunk.choices[0].delta

                    # Handle content
                    if delta.content:
                        # If this is the first content, signal start of response
                        if not collected_content:
                            logger.info("Starting to collect response content")
                            yield {"type": "status", "message": "Synthesizing response...", "tool": "generate"}
                        collected_content += delta.content
                        yield {"type": "text", "content": delta.content}
                        logger.debug(f"Collected content length now: {len(collected_content)}")

                    # Handle tool calls
                    if hasattr(delta, 'tool_calls') and delta.tool_calls:
                        for tool_call_delta in delta.tool_calls:
                            # Initialize tool call if needed
                            if tool_call_delta.index >= len(collected_tool_calls):
                                collected_tool_calls.append({
                                    "id": tool_call_delta.id or "",
                                    "type": "function",
                                    "function": {"name": "", "arguments": ""}
                                })

                            # Update tool call
                            tc = collected_tool_calls[tool_call_delta.index]
                            if tool_call_delta.id:
                                tc["id"] = tool_call_delta.id
                            if tool_call_delta.function:
                                if tool_call_delta.function.name:
                                    tc["function"]["name"] = tool_call_delta.function.name
                                if tool_call_delta.function.arguments:
                                    tc["function"]["arguments"] += tool_call_delta.function.arguments

                    # Check if done
                    if chunk.choices[0].finish_reason in ["stop", "end_turn"]:
                        logger.info(f"Agent completed in {iteration + 1} iterations with {len(tool_calls_log)} tool calls")
                        logger.info(f"Final collected_content length: {len(collected_content)}")
                        logger.info(f"Final collected_content preview: {collected_content[:200]}")
                        # Yield the final result instead of returning it so the caller can capture it
                        yield {
                            "type": "result",
                            "response": collected_content,
                            "tool_calls": tool_calls_log,
                            "iterations": iteration + 1,
                            "model": self.__class__.__name__,
                        }
                        return

                # Handle tool calls if present
                if collected_tool_calls:
                    # Add assistant message with tool calls
                    messages.append({
                        "role": "assistant",
                        "content": collected_content,
                        "tool_calls": collected_tool_calls,
                    })

                    # Execute tools
                    tool_results = []
                    for tool_call in collected_tool_calls:
                        tool_use = {
                            "id": tool_call["id"],
                            "name": tool_call["function"]["name"],
                            "input": json.loads(tool_call["function"]["arguments"]),
                        }

                        # Yield status about tool execution
                        status_message = self._format_tool_status(tool_use["name"], tool_use["input"])
                        yield {"type": "status", "message": status_message, "tool": tool_use["name"]}

                        # Yield thought fragment showing tool args
                        if tool_use["name"] == "search_corpus":
                            query_preview = tool_use["input"].get("query", "")[:40]
                            yield {"type": "status", "message": f"query=\"{query_preview}...\", k={tool_use['input'].get('k', 'default')}", "tool": tool_use["name"]}
                        elif tool_use["name"] == "check_incremental_reasoning":
                            yield {"type": "status", "message": "Analyzing query distribution...", "tool": tool_use["name"]}

                        result = self._execute_tool(tool_use)
                        tool_results.append(result)
                        tools_called_count += 1  # Increment counter
                        tool_calls_log.append(ToolCall(
                            tool=tool_use["name"],
                            input=tool_use["input"],
                            result_count=len(result) if isinstance(result, list) else 1,
                        ))

                        # Detailed search logging
                        if tool_use["name"] == "search_corpus":
                            query = tool_use["input"].get("query", "")
                            k = tool_use["input"].get("k", "default")
                            logger.info(f"[GPT SEARCH #{tools_called_count}] query=\"{query[:80]}\" k={k} -> {len(result) if isinstance(result, list) else 0} results")

                        # Yield completion status with fragments
                        if isinstance(result, list) and len(result) > 0:
                            yield {"type": "status", "message": f"✓ Retrieved {len(result)} results", "tool": tool_use["name"]}
                            # Show snippet of first result
                            first_text = result[0].get("text", "")[:50].replace("\n", " ")
                            yield {"type": "status", "message": f"  \"{first_text}...\"", "tool": tool_use["name"]}
                        elif isinstance(result, dict) and "is_ood" in result:
                            ood_status = "out-of-distribution" if result.get("is_ood") else "in-distribution"
                            yield {"type": "status", "message": f"Query is {ood_status}", "tool": tool_use["name"]}
                            # Show reasoning fragment
                            if result.get("is_ood") and result.get("reasoning"):
                                reasoning_preview = result["reasoning"][:50]
                                yield {"type": "status", "message": f"Reason: {reasoning_preview}...", "tool": tool_use["name"]}
                            # Show guidance fragment if OOD
                            if result.get("is_ood") and result.get("guidance"):
                                guidance_preview = result["guidance"][:60].replace("\n", " ")
                                yield {"type": "status", "message": f"Guidance: {guidance_preview}...", "tool": tool_use["name"]}
                        else:
                            yield {"type": "status", "message": "Complete", "tool": tool_use["name"]}

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
        logger.warning(f"Max iterations ({self.max_iterations}) reached")
        yield {
            "type": "result",
            "response": collected_content if collected_content else "Max iterations reached",
            "tool_calls": tool_calls_log,
            "iterations": self.max_iterations,
            "model": self.__class__.__name__,
        }
