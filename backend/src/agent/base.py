"""Base agent class for multi-model support"""

import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any, NamedTuple, Optional, Literal

from openai.types.chat import ChatCompletionMessageParam

from ..config import Config
from .tools import CorpusSearchTool, IncrementalReasoningTool

logger = logging.getLogger(__name__)


class ToolCall(NamedTuple):
    tool: str
    input: dict[str, Any]
    result_count: int


# TODO should this just be the same as ToolCall?
class ToolUse(NamedTuple):
    id: str
    name: str
    input: dict[str, Any]


class Response(NamedTuple):
    response: str
    tool_calls: list[ToolCall]
    iterations: int
    model: str
    error: Optional[str] = None


class BaseAgent(ABC):
    """Abstract base class for all model agents"""

    def __init__(
        self,
        persona_id: str,
        config: Config,
        use_json_mode: bool,
    ):
        """
        Initialize base agent.

        Args:
            persona_id: Persona identifier (e.g., "jules", "heidegger")
            config: Configuration object
        """
        self.config = config
        self.use_json_mode = use_json_mode
        self.persona_id = persona_id
        self.persona = config.get_persona(persona_id)
        self.user_name = self.persona.name  # For backwards compatibility
        self.max_iterations = 20
        self.search_tool = CorpusSearchTool(self.persona.collection_name, config)
        self.reasoning_tool = IncrementalReasoningTool(
            self.persona.collection_name, self.persona.name, config
        )

        self.prompt_file: Optional[str] = None

    @abstractmethod
    def _call_model(self, system: str, messages: list[ChatCompletionMessageParam]) -> Any:
        """
        Call the underlying model API.

        Args:
            system: System prompt
            messages: Conversation messages

        Returns:
            Model response object
        """
        pass

    @abstractmethod
    def _parse_tool_use(self, response: Any) -> list[ToolUse]:
        """
        Extract tool calls from model response.

        Args:
            response: Model response object

        Returns:
            List of tool calls with format: [{"id": str, "name": str, "input": dict}]
        """
        pass

    @abstractmethod
    def _is_complete(self, response: Any) -> bool:
        """
        Check if model has finished responding.

        Args:
            response: Model response object

        Returns:
            True if model is done, False if it wants to use tools
        """
        pass

    @abstractmethod
    def _extract_text(self, response: Any) -> str:
        """
        Extract text content from model response.

        Args:
            response: Model response object

        Returns:
            Text content
        """
        pass

    @abstractmethod
    def _update_messages(
        self, messages: list[ChatCompletionMessageParam], response: Any, tool_results: list[Any]
    ) -> list[ChatCompletionMessageParam]:
        """
        Update message list with assistant response and tool results.

        Args:
            messages: Current message list
            response: Model response
            tool_results: Results from tool execution

        Returns:
            Updated message list
        """
        pass

    def _build_system_prompt(self, prompt_file: str = "base.txt") -> str:
        """
        Build system prompt from template.

        Args:
            prompt_file: Name of the prompt file to use (default: "base.txt")

        Returns:
            System prompt string
        """
        # Load base prompt
        prompt_dir = Path(self.config.agent.system_prompt_dir)
        base_prompt_path = prompt_dir / prompt_file

        with open(base_prompt_path, "r") as f:
            base_prompt = f.read()

        # Format with user name
        prompt = base_prompt.format(user_name=self.user_name)

        # Add model-specific additions
        model_specific = self._get_model_specific_prompt()
        if model_specific:
            prompt += "\n\n" + model_specific.format(user_name=self.user_name)

        # Add style pack for grounding (diverse writing samples)
        logger.info(f"Style pack enabled: {self.config.retrieval.style_pack_enabled}")
        if self.config.retrieval.style_pack_enabled:
            style_pack = self.search_tool.get_style_pack()
            logger.info(
                f"Style pack retrieved: {len(style_pack) if style_pack else 0} samples"
            )
            if style_pack:
                prompt += "\n\n" + "=" * 70
                prompt += (
                    f"\n\nSTYLE GROUNDING - {self.user_name}'s Writing Examples:\n"
                )
                prompt += f"The following are representative samples of how {self.user_name} writes. Use these to match their style, tone, and communication patterns.\n\n"

                for i, sample in enumerate(style_pack, 1):
                    source = sample.metadata.get("source", "unknown")
                    file_path = sample.metadata.get("file_path", "")
                    # Extract filename from path for better reference
                    if file_path:
                        import os

                        source = os.path.basename(file_path)
                    prompt += f"\n--- Example {i} (from {source}) ---\n"
                    # Use longer samples to capture style better (1000 chars)
                    text = sample.text
                    if len(text) > 1000:
                        text = text[:1000] + "..."
                    prompt += text + "\n"

                prompt += "\n" + "=" * 70
                prompt += f"\n\nCRITICAL STYLE INSTRUCTION: Your feedback must be written in the SAME VOICE, TONE, and STYLE as the examples above. "
                prompt += f"Emulate how {self.user_name} writes - their sentence structure, vocabulary choices, rhetorical patterns, and communication style. "
                prompt += "Do not write generic feedback. Write feedback AS IF you are this author critiquing the work.\n"
                logger.info(
                    f"Style pack added to system prompt ({len(style_pack)} examples)"
                )

        return prompt

    def _get_model_specific_prompt(self) -> Optional[str]:
        """
        Get model-specific prompt additions.
        Override in subclasses.

        Returns:
            Model-specific prompt or None
        """
        return None

    def _should_force_tool_use(self) -> bool:
        """
        Determine if tool use should be forced for this iteration.
        Only force on first iteration if force_tool_use is enabled.

        Returns:
            True if tools should be required, False otherwise
        """
        return self.config.agent.force_tool_use and self._current_tool_calls_count == 0

    def _execute_tool(self, tool_use: ToolUse) -> Any:
        """
        Execute a tool call.

        Args:
            tool_use: Tool call dict with name and input

        Returns:
            Tool execution result
        """
        result: Any
        if tool_use.name == "search_corpus":
            try:
                result = self.search_tool.search(**tool_use.input)
                logger.debug(f"Tool search returned {len(result)} results")
                return result
            except Exception as e:
                logger.error(f"Error executing search_corpus: {e}")
                return {"error": str(e)}
        elif tool_use.name == "check_incremental_reasoning":
            try:
                result = self.reasoning_tool.check_and_guide(**tool_use.input)
                logger.debug(
                    f"Incremental reasoning check: OOD={result.get('is_ood', False)}"
                )
                return result
            except Exception as e:
                logger.error(f"Error executing check_incremental_reasoning: {e}")
                return {"error": str(e)}
        else:
            e2 = f"Unknown tool: {tool_use.name}"
            logger.error(e2)
            return {"error": e2}

    def respond(
        self, query: str, conversation_history: Optional[list[ChatCompletionMessageParam]] = None
    ) -> Response:
        """
        Main agent loop - model self-orchestrates retrieval.

        Args:
            query: User query
            conversation_history: Optional list of previous messages [{"role": "user/assistant", "content": "..."}]

        Returns:
            Dict with response, tool_calls, iterations, and model name
        """
        # Use custom prompt file if agent has one
        prompt_file = self.prompt_file or "base.txt"
        system_prompt = self._build_system_prompt(prompt_file)

        # Start with conversation history if provided
        if conversation_history:
            messages = conversation_history.copy()
        else:
            messages = []

        messages.append({"role": "user", "content": query})

        tool_calls_log: list[ToolCall] = []
        self._current_tool_calls_count = 0  # Track for tool_choice logic

        logger.info(f"Starting agent loop for query: {query[:100]}...")

        for iteration in range(self.max_iterations):
            logger.debug(f"Iteration {iteration + 1}/{self.max_iterations}")

            try:
                # Call model
                response = self._call_model(system_prompt, messages)

                # Check if model is done
                if self._is_complete(response):
                    final_response = self._extract_text(response)
                    logger.info(
                        f"Agent completed in {iteration + 1} iterations with {len(tool_calls_log)} tool calls"
                    )
                    return Response(
                        response=final_response,
                        tool_calls=tool_calls_log,
                        iterations=iteration + 1,
                        model=self.__class__.__name__,
                    )

                # Execute tool calls
                tool_uses = self._parse_tool_use(response)
                if tool_uses:
                    tool_results = []
                    for tool_use in tool_uses:
                        result = self._execute_tool(tool_use)
                        tool_results.append(result)
                        tool_calls_log.append(
                            ToolCall(
                                tool=tool_use.name,
                                input=tool_use.input,
                                result_count=len(result) if isinstance(result, list) else 1,
                            )
                        )
                        self._current_tool_calls_count += 1  # Increment counter

                    # Update conversation
                    messages = self._update_messages(messages, response, tool_results)
                else:
                    # No tools but not complete - add response and continue
                    text = self._extract_text(response)
                    if text:
                        logger.info(f"Agent completed with text response")
                        return Response(
                            response=text,
                            tool_calls=tool_calls_log,
                            iterations=iteration + 1,
                            model=self.__class__.__name__,
                        )

            except Exception as e:
                logger.error(f"Error in iteration {iteration + 1}: {e}")
                return Response(
                    response=f"Error: {str(e)}",
                    tool_calls=tool_calls_log,
                    iterations=iteration + 1,
                    model=self.__class__.__name__,
                    error=str(e),
                )

        logger.warning(f"Max iterations ({self.max_iterations}) reached")
        return Response(
            response="Max iterations reached without completion",
            tool_calls=tool_calls_log,
            iterations=self.max_iterations,
            model=self.__class__.__name__,
        )
